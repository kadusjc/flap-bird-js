importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest');

const MODEL_PATH = `../machine-learning/yolov5n_web_model/model.json`;
const LABELS_PATH = `../machine-learning/yolov5n_web_model/labels.json`;
const INPUT_MODEL_DIMENTIONS = 640
const CLASS_THRESHOLD = 0.5

let _labels = []
let _model = null

/**
 * loadModelAndLabels — Carrega o modelo YOLOv5 e os labels, e faz um warmup (aquecimento para testar).
 *
 * Passo a passo:
 * 1. tf.ready() — Aguarda o TensorFlow.js inicializar o backend (WebGL/WASM/CPU).
 *    Só depois disso é possível usar operações com tensores.
 *
 * 2. fetch(LABELS_PATH) — Baixa o arquivo JSON com os nomes das classes
 *    (ex: ["player", "obstacle"]). Esses labels mapeiam o índice numérico
 *    retornado pelo modelo para um nome legível.
 *
 * 3. tf.loadGraphModel(MODEL_PATH) — Carrega o modelo YOLOv5 convertido para
 *    formato TensorFlow.js (model.json + arquivos .bin com os pesos).
 *
 * 4. Warmup — Cria um tensor "dummy" (tudo 1s) com o mesmo shape da entrada
 *    do modelo e roda uma inferência descartável. Isso força o navegador a
 *    compilar os shaders WebGL e alocar memória na GPU na primeira vez,
 *    para que as inferências reais sejam mais rápidas.
 *
 * 5. postMessage({ type: 'model-loaded' }) — Avisa a thread principal (Game.js)
 *    que o modelo está pronto para receber imagens.
 */
async function loadModelYOLOv5AndItsLabels() {
    await tf.ready()
    
    _labels = await (await fetch(LABELS_PATH)).json()
    _model = await tf.loadGraphModel(MODEL_PATH)
    
    const dummyInput = tf.ones(_model.inputs[0].shape)
    await _model.executeAsync(dummyInput)
    tf.dispose(dummyInput)
    
    postMessage({ type: 'model-loaded' })
}

/**
 * 
 * Esse trecho prepara a imagem do canvas para ser consumida pelo modelo YOLOv5. Cada passo tem uma razão:
 * 1. `tf.browser.fromPixels(input)` converte a imagem do canvas em um tensor.
 * 2. `tf.image.resizeBilinear` redimensiona a imagem para as dimensões esperadas pelo modelo.
 * 3. `.div(255)` normaliza os valores dos pixels para o intervalo [0, 1].
 * 4. `.expandDims(0)` adiciona uma dimensão de batch, necessária para a entrada do modelo.
 * 

ImageBitmap (800×400)
  → tf.browser.fromPixels()     → Tensor [400, 800, 3] (valores 0-255 RGB)
  → resizeBilinear(640, 640)    → Tensor [640, 640, 3]
  → .div(255)                   → Tensor [640, 640, 3] (valores 0-1)
  → .expandDims(0)              → Tensor [1, 640, 640, 3] (pronto pro modelo)

   tf.tidy() que envolve tudo garante que tensores intermediários sejam liberados da memória automaticamente, evitando vazamento de memória (GPU/RAM).
 */
function createAndFormatImageTensor(image) {
    return tf.tidy(() => {
        const tensorImage = tf.browser.fromPixels(image)

        return tf.image
            .resizeBilinear(tensorImage, [INPUT_MODEL_DIMENTIONS, INPUT_MODEL_DIMENTIONS])
            .div(255)
            .expandDims(0)
    });
}


/**
 * runYoloModelOverTensorAndGetDetections — Executa o modelo YOLOv5 sobre um tensor de imagem e retorna as detecções.
 *
 * Passo a passo:
 * 1. Executa o modelo (_model.executeAsync) passando o tensor da imagem pré-processada.
 *    O modelo retorna um array de tensores com as previsões (boxes, scores, classes, etc.).
 *
 * 2. Libera o tensor de entrada da memória (tf.dispose), pois já foi consumido pelo modelo
 *    e não será mais usado. Isso evita vazamento de memória na GPU/RAM.
 *
 * 3. Extrai os 3 primeiros tensores da saída do modelo:
 *    - boxes:   coordenadas das caixas delimitadoras (bounding boxes) [x1, y1, x2, y2]
 *    - scores:  confiança (0 a 1) de cada detecção
 *    - classes: índice numérico da classe detectada (ex: 0 = jogador, 1 = obstáculo)
 *
 * 4. Converte os tensores em arrays JavaScript puros (.data()) usando Promise.all
 *    para fazer as 3 conversões em paralelo (mais rápido).
 *
 * 5. Libera todos os tensores de saída da memória (output.forEach → dispose).
 *
 * 6. Retorna um objeto com os dados já em arrays JavaScript prontos para uso.
 *
 * @param {tf.Tensor} tensor — Tensor [1, 640, 640, 3] vindo de createAndFormatImageTensor()
 * @returns {{ boxes: Float32Array, scores: Float32Array, classes: Float32Array }}
 */
async function runYoloModelOverTensorAndGetDetections(tensor) {
    // 1. Roda o modelo sobre o tensor — retorna array de tensores com as previsões
    const output = await _model.executeAsync(tensor)

    // 2. Libera o tensor de entrada da memória (já foi usado)
    tf.dispose(tensor)

    // 3. Pega os 3 primeiros tensores: caixas, pontuações e classes
    const [boxes, scores, classes] = output.slice(0, 3)

    // 4. Converte tensores GPU → arrays JavaScript (em paralelo)
    const [boxesData, scoresData, classesData] = await Promise.all([
        boxes.data(),
        scores.data(),
        classes.data(),
    ])

    // 5. Libera todos os tensores de saída da memória
    output.forEach(t => t.dispose())

    // 6. Retorna os dados como arrays JavaScript puros
    return {
        boxes: boxesData,       // Coordenadas das bounding boxes
        scores: scoresData,     // Confiança de cada detecção (0 a 1)
        classes: classesData    // Índice da classe detectada
    }
}

/**
 * Filtra e processa as predições:
 * - Aplica o limiar de confiança (CLASS_THRESHOLD)
 * - Filtra apenas a classe desejada (exemplo: 'kite')
 * - Converte coordenadas normalizadas para pixels reais
 * - Calcula o centro do bounding box
 *
 * Uso de generator (function*):
 * - Permite enviar cada predição assim que processada, sem criar lista intermediária
 */
function* processPrediction({ boxes, scores, classes }, width, height) {
    for (let index = 0; index < scores.length; index++) {
        if (scores[index] < CLASS_THRESHOLD) continue


        //No nosso desenho, identificou os obstaculos como "Stop Sign" e os obstaculos como "surfboard" ou "frisbee"
        //E a nave (player) como kite ou airplane
        const label = _labels[classes[index]]
        console.log(`[Worker] Detecção: ${label} (confiança: ${scores[index].toFixed(2)})`)

        //if (!['frisbee', 'stop sign', 'kite'].includes(label.toLowerCase())) continue; 

        let [x1, y1, x2, y2] = boxes.slice(index * 4, (index + 1) * 4) //cada box tem 4 dimensões
        x1 *= width
        x2 *= width
        y1 *= height
        y2 *= height

        
        const centerX = (x1 + x2) / 2
        const centerY = (y1 + y2) / 2

        yield {
            label,
            confidence: scores[index],
            bbox: [x1, y1, x2, y2],
            center: [centerX, centerY]
        }
    }
}

/**
 * GameWorker.js — Web Worker para processar frames do jogo em thread separada.
 *
 * Recebe mensagens do Game (thread principal) e responde com ações.
 *
 * Mensagens recebidas (event.data):
 *   { type: 'predict', image: ImageBitmap }  → Recebe um frame do canvas para análise
 *   { type: 'gameState', state: {...} }       → Recebe dados do estado do jogo
 *
 * Mensagens enviadas (postMessage):
 *   { type: 'action', action: 'jump' }       → Manda o jogador pular
 *   { type: 'action', action: 'none' }       → Nenhuma ação
 *   { type: 'ready' }                        → Worker pronto para receber dados
 */

// Avisa a thread principal que o Worker está pronto
self.postMessage({ type: 'ready' })


/**
 * onmessage — Listener principal do Worker.
 * Recebe mensagens da thread principal e processa conforme o tipo.
 */
self.onmessage = async (e) => {
  const { type } = e.data

  if (type === 'predict') {
    // Ignora se o modelo ainda não carregou
    if (!_model) {
      console.log('[Worker] Modelo ainda não carregado, ignorando frame')
      return
    }

    const input = createAndFormatImageTensor(e.data.image);
    const { width, height } = e.data.image;
    const shape = input.shape // Salva o shape antes do dispose dentro de runYoloModelOverTensorAndGetDetections

    const inferenceResults = await runYoloModelOverTensorAndGetDetections(input)
    for (const prediction of processPrediction(inferenceResults, width, height)) {
        postMessage({
            type: 'prediction',
            ...prediction
        });
    }

    //console.log('[Worker] Predição concluída. Shape:', shape, 'Resultados:', inferenceResults)
  }  

  if (type === 'gameState') {
    const state = e.data.state
    // TODO: Usar o estado do jogo (posição do jogador, obstáculos, score)
    // para decidir se deve pular ou não
    // Exemplo: if (state.player.y > 300) → pular
    //console.log('[Worker] Estado recebido:', state)
  }
}

loadModelYOLOv5AndItsLabels();
console.log('🧠 YOLOv5n Web Worker initialized');

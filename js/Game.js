
/**
 * Game.js — Classe principal que orquestra todo o jogo.
 *
 * Responsabilidades:
 * - Gerencia o jogador (Player), obstáculos (Obstacle[]) e o nível (LevelManager).
 * - constructor(): inicializa o canvas, background, jogador, lista de obstáculos,
 *   contadores de frame/score, e registra os controles via Input.
 * - spawn(): cria um novo obstáculo e o adiciona à lista.
 * - update(): executado a cada frame do game loop:
 *     1. Incrementa o frame.
 *     2. Atualiza a posição do jogador (gravidade + pulo).
 *     3. A cada X frames (spawnRate do nível atual), gera um novo obstáculo.
 *     4. Move cada obstáculo para a esquerda na velocidade do nível.
 *     5. Verifica colisão jogador ↔ obstáculo → gameOver().
 *     6. Remove obstáculos que saíram da tela, incrementa score e atualiza o nível.
 * - draw(): limpa o canvas e redesenha: background → jogador → obstáculos → HUD (score/level).
 * - gameOver(): para o jogo, exibe alerta com score e recarrega a página.
 */

import Player from "./Player.js"           // Classe do jogador
import Obstacle from "./Obstacle.js"       // Classe dos obstáculos
import LevelManager from "./LevelManager.js" // Gerenciador de níveis/dificuldade
import collide from "./Collision.js"       // Função de detecção de colisão AABB
import Input from "./Input.js"             // Gerenciador de entrada do teclado

export default class Game {

  // constructor — Inicializa todos os componentes do jogo
  constructor(canvas, ctx, worker) {
    this.canvas = canvas   // Referência ao elemento <canvas>
    this.ctx = ctx         // Contexto 2D para desenhar
    this.worker = worker   // Web Worker para processar frames em thread separada

    this.bg = new Image()          // Cria objeto de imagem para o fundo
    this.bg.src = "./assets/bg.png" // Carrega a imagem de background

    this.player = new Player()  // Cria o jogador
    this.obstacles = []         // Array que armazena os obstáculos ativos na tela

    this.frame = 0   // Contador de frames (usado para controlar o spawn)
    this.score = 0   // Pontuação do jogador

    this.running = true                  // Flag que indica se o jogo está rodando
    this.levelManager = new LevelManager() // Gerenciador de dificuldade
    this.predictions = []  // Detecções do YOLO (bounding boxes para debug visual)

    new Input(this.player) // Registra os controles do teclado (Espaço → pulo)

    this.setupWorker() // Configura comunicação com o Worker
  }

  // setupWorker — Configura envio periódico de frames e escuta respostas do Worker
  setupWorker() {
    // Escuta mensagens vindas do Worker
    this.worker.onmessage = (e) => {
      const { type } = e.data

      if (type === 'ready') {
        console.log('[Game] Worker pronto')
      }

      if (type === 'action') {
        if (e.data.action === 'jump') {
          this.player.jump() // Worker mandou pular
        }
      }

      if (type === 'prediction') {
        this.predictions.push({
          label: e.data.label,
          confidence: e.data.confidence,
          bbox: e.data.bbox,
          timestamp: performance.now()
        })
        // Remove predições antigas (> 500ms) para não acumular
        const now = performance.now()
        this.predictions = this.predictions.filter(p => now - p.timestamp < 500)
      }

    }

    // Envia snapshot do canvas ao Worker a cada 200ms
    this.snapshotInterval = setInterval(async () => {
      if (!this.running) return

      // Captura o canvas como ImageBitmap e envia ao Worker
      const bitmap = await createImageBitmap(this.canvas)
      //
      this.worker.postMessage({ type: 'predict', image: bitmap }, [bitmap])

      // Também envia o estado do jogo (dados numéricos, mais leve)
      this.worker.postMessage({
        type: 'gameState',
        state: {
          player: { x: this.player.x, y: this.player.y, vy: this.player.vy },
          obstacles: this.obstacles.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h })),
          score: this.score,
          level: this.levelManager.level
        }
      })
    }, 200)
  }

  // spawn — Cria um novo obstáculo na borda direita e o adiciona à lista
  spawn() {
    this.obstacles.push(new Obstacle(this.canvas))
  }

  /**
   * update() — Executado a cada frame do game loop.
   *
   * 1. this.frame++ incrementa o contador de frames.
   * 2. this.frame % spawnRate() === 0 verifica se é hora de criar um obstáculo.
   *    No nível 1, spawnRate = 120, então a cada 120 frames (~2s) um novo obstáculo surge.
   *    No nível 8, spawnRate = 50 (~0.8s) — quanto maior o nível, mais frequente o spawn.
   * 3. this.spawn() cria um new Obstacle na borda direita e o adiciona ao array this.obstacles.
   * 4. O for percorre os obstáculos de trás para frente (i--) para poder remover com splice()
   *    sem pular índices. Cada obstáculo é movido para a esquerda (o.update(speed)).
   * 5. Se colidir com o jogador → gameOver().
   * 6. Se o obstáculo saiu da tela (x + w < 0), é removido, score++ e nível atualizado.
   */
  update() {
    if(!this.running) return // Se o jogo acabou, não faz nada
    this.frame++             // Incrementa o contador de frames

    this.player.update() // Atualiza posição do jogador (aplica gravidade)

    // Verifica se é hora de criar um novo obstáculo (a cada spawnRate frames)
    if (this.frame % this.levelManager.spawnRate() === 0) {
      this.spawn() // Cria e adiciona um novo obstáculo
    }

    // Percorre obstáculos de trás para frente (i--) para poder remover com splice sem pular índices
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      let o = this.obstacles[i]

      o.update(this.levelManager.speed()) // Move o obstáculo para a esquerda na velocidade do nível

      if (collide(this.player, o)) { // Testa colisão jogador ↔ obstáculo
        this.gameOver()              // Se colidiu, fim de jogo
      }

      if (o.x + o.w < 0) {                  // Se o obstáculo saiu completamente da tela pela esquerda
        this.obstacles.splice(i, 1)          // Remove da lista
        this.score++                         // Incrementa a pontuação
        this.levelManager.update(this.score) // Verifica se deve subir de nível
      }
    }
  }


  /**
   * draw() — Redesenha toda a tela a cada frame. Chamado pelo game loop após update().
   *
   * A ordem de desenho importa — elementos desenhados depois ficam por cima:
   * 1. clearRect() limpa todo o canvas, apagando o frame anterior.
   * 2. Desenha o background (bg) cobrindo o canvas inteiro.
   * 3. Desenha o jogador (sprite do pássaro) na posição atual.
   * 4. Desenha todos os obstáculos percorrendo o array this.obstacles.
   * 5. Configura cor branca e fonte 20px Arial para o HUD.
   * 6. Exibe o score no canto superior esquerdo (x=10, y=25).
   * 7. Exibe o nível atual logo abaixo (x=10, y=50).
   */
  draw() {
    // Limpa todo o canvas para redesenhar do zero
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Desenha a imagem de fundo (só se já carregou)
    if (this.bg.complete) {
      this.ctx.drawImage(this.bg, 0, 0, this.canvas.width, this.canvas.height)
    }

    // Desenha o jogador
    this.player.draw(this.ctx)

    // Desenha cada obstáculo na posição atual
    for (let o of this.obstacles) {
      o.draw(this.ctx)
    }

    // HUD: configura estilo do texto
    this.ctx.fillStyle = "white"
    this.ctx.font = "20px Arial"

    // HUD: exibe score e nível no canto superior esquerdo
    this.ctx.fillText("Score: " + this.score, 10, 25)
    this.ctx.fillText("Level: " + this.levelManager.level, 10, 50)

    // Desenha bounding boxes das detecções YOLO (retângulos vermelhos)
    this.drawPredictions();
    
    // Se o jogo acabou, desenha a tela de Game Over por cima de tudo
    if (!this.running) {
      this.drawGameOver()
    }
  }

  drawPredictions() {

    for (const pred of this.predictions) {
      const [x1, y1, x2, y2] = pred.bbox
      this.ctx.strokeStyle = "red"
      this.ctx.lineWidth = 2
      this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      this.ctx.fillStyle = "red"
      this.ctx.font = "14px Arial"
      this.ctx.fillText(`${pred.label} ${(pred.confidence * 100).toFixed(0)}%`, x1, y1 - 4)
    }
  }

  // drawGameOver — Desenha a tela de fim de jogo com estilo de game em vermelho
  drawGameOver() {
    const cx = this.canvas.width / 2   // Centro horizontal do canvas
    const cy = this.canvas.height / 2  // Centro vertical do canvas

    // Fundo escuro semi-transparente para destaque
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    // Texto "GAME OVER" grande em vermelho com borda preta
    this.ctx.textAlign = "center"
    this.ctx.font = "bold 72px Impact, Arial"

    // Sombra/borda preta para dar profundidade
    this.ctx.strokeStyle = "black"
    this.ctx.lineWidth = 8
    this.ctx.strokeText("GAME OVER", cx, cy - 30)

    // Texto vermelho por cima
    this.ctx.fillStyle = "#FF0000"
    this.ctx.fillText("GAME OVER", cx, cy - 30)

    // Score abaixo em branco
    this.ctx.font = "bold 32px Impact, Arial"
    this.ctx.strokeStyle = "black"
    this.ctx.lineWidth = 4
    this.ctx.strokeText("Score: " + this.score, cx, cy + 30)
    this.ctx.fillStyle = "white"
    this.ctx.fillText("Score: " + this.score, cx, cy + 30)

    // Instrução para reiniciar
    this.ctx.font = "20px Arial"
    this.ctx.fillStyle = "#CCCCCC"
    this.ctx.fillText("Pressione ESPAÇO para reiniciar", cx, cy + 75)

    // Reseta o alinhamento para não afetar outros textos
    this.ctx.textAlign = "left"
  }

  // gameOver — Encerra o jogo e aguarda input para reiniciar
  gameOver() {
    if(!this.running) return  // Evita chamar gameOver() múltiplas vezes
    this.running = false      // Para o update() nos próximos frames

    clearInterval(this.snapshotInterval) // Para de enviar frames ao Worker

    // Escuta Espaço para reiniciar o jogo (em vez de alert + reload automático)
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        location.reload()  // Recarrega a página para reiniciar o jogo
      }
    }, { once: true })       // { once: true } remove o listener após o primeiro uso
  }

}

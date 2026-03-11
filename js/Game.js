
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
    this.won = false                       // Flag que indica se o jogador zerou o jogo
    this.levelManager = new LevelManager() // Gerenciador de dificuldade
    this.predictions = []  // Detecções do YOLO (bounding boxes para debug visual)

    // Sistema de evasão: Y fixo para travar o player durante desvio
    this.fixedY = null

    // Sistema de anúncio de level up
    this.levelAnnounce = null  // { level, startTime }
    this.levelColors = [
      '#00FF88', // Level 1 — verde neon
      '#00BFFF', // Level 2 — azul celeste
      '#FFD700', // Level 3 — dourado
      '#FF6B35', // Level 4 — laranja
      '#FF1493', // Level 5 — rosa forte
      '#9B59FF', // Level 6 — roxo
      '#00FFFF', // Level 7 — ciano
      '#FF0040', // Level 8 — vermelho intenso
    ]

    new Input(this.player) // Registra os controles do teclado (Espaço → pulo)

    this.setupWorker() // Configura comunicação com o Worker

    // Mostra "LEVEL 1" ao iniciar o jogo
    this.levelAnnounce = { level: 1, startTime: performance.now() }
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

      if (type === 'predictionResult') {
        //Inicio desenho na tela — Armazena predictions para desenhar na tela
        this.predictions.push({
         label: e.data.label,
          confidence: e.data.confidence,
          bbox: e.data.bbox,
          timestamp: performance.now()
        })
        // Remove predições antigas (> 500ms) para não acumular
        const now = performance.now()
        this.predictions = this.predictions.filter(p => now - p.timestamp < 500)
        //Fim desenho na tela

        //Metodo que faz a IA jogar sozinha usando as predições do modelo YOLO para detectar os obstáculos e mover o player para evitar colidir com eles
        this.makeAirplaneMoveAwayObstacles(e.data);
      }
    }

    // Envia snapshot do canvas ao Worker a cada 200ms
    this.snapshotInterval = setInterval(async () => {
      if (!this.running) return

      // Captura o canvas como ImageBitmap e envia ao Worker
      const bitmap = await createImageBitmap(this.canvas)
      this.worker.postMessage({ type: 'predict', image: bitmap }, [bitmap])
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

    // Se fixedY está ativo, trava o player na posição segura; senão, atualiza normalmente
    if (this.fixedY !== null) {
      this.player.y = this.fixedY
      this.player.vy = 0
    } else {
      this.player.update()
    }

    // Verifica se é hora de criar um novo obstáculo (a cada spawnRate frames)
    if (this.frame % this.levelManager.spawnRate() === 0) {
      this.spawn() // Cria e adiciona um novo obstáculo
    }

    // Percorre obstáculos de trás para frente (i--) para poder remover com splice sem pular índices
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      let o = this.obstacles[i]

      o.update(this.levelManager.speed()) // Move o obstáculo para a esquerda na velocidade do nível

      if (collide(this.player, o)) { // Testa colisão jogador ↔ obstáculo
        console.log('====== Bateu obstaculo x '+o.x+' y '+o.y+ ' Player x '+this.player.x+' y '+this.player.y);
        console.log('obstaculo y = '+ (o.y - o.h)+ ' Player y = '+this.player.y);
        console.log('obstaculo x = '+ (o.x - o.w)+ ' Player x = '+this.player.x);
    
        this.gameOver();
        return;// Se colidiu, fim de jogo
      }

      if (o.x + o.w < 0) {                  // Se o obstáculo saiu completamente da tela pela esquerda
        this.obstacles.splice(i, 1)          // Remove da lista
        this.score++                         // Incrementa a pontuação
        if (this.levelManager.update(this.score)) { // Verifica se subiu de nível
          this.levelAnnounce = { level: this.levelManager.level, startTime: performance.now() }
        }
        // Verifica se zerou o jogo (completou todos os 8 níveis: 80 pontos)
        if (this.score >= 80) {
          this.youWin()
          return
        }
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

    // Desenha anúncio de level up (se ativo)
    this.drawLevelAnnounce()
    
    // Se o jogo acabou, desenha a tela correspondente por cima de tudo
    if (!this.running) {
      if (this.won) {
        this.drawYouWin()
      } else {
        this.drawGameOver()
      }
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

  // drawLevelAnnounce — Exibe "LEVEL X" grande na tela por 2 segundos com fade out
  drawLevelAnnounce() {
    if (!this.levelAnnounce) return

    const elapsed = performance.now() - this.levelAnnounce.startTime
    const duration = 2000 // 2 segundos de exibição

    if (elapsed > duration) {
      this.levelAnnounce = null
      return
    }

    const cx = this.canvas.width / 2
    const cy = this.canvas.height / 2

    // Opacidade: 100% no primeiro segundo, fade out no segundo
    const alpha = elapsed < 1000 ? 1 : 1 - (elapsed - 1000) / 1000

    // Escala: começa grande (1.3) e diminui até 1.0 nos primeiros 300ms
    const scale = elapsed < 300 ? 1.3 - 0.3 * (elapsed / 300) : 1.0

    const level = this.levelAnnounce.level
    const color = this.levelColors[level - 1] || '#FFFFFF'

    this.ctx.save()
    this.ctx.globalAlpha = alpha
    this.ctx.textAlign = 'center'

    // Fundo escuro sutil atrás do texto
    this.ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * alpha})`
    this.ctx.fillRect(0, cy - 60 * scale, this.canvas.width, 120 * scale)

    // Texto "LEVEL X" com borda preta
    this.ctx.font = `bold ${Math.round(64 * scale)}px Impact, Arial`
    this.ctx.strokeStyle = 'black'
    this.ctx.lineWidth = 6
    this.ctx.strokeText('LEVEL ' + level, cx, cy + 10)
    this.ctx.fillStyle = color
    this.ctx.fillText('LEVEL ' + level, cx, cy + 10)

    this.ctx.restore()
    this.ctx.textAlign = 'left' // Reseta alinhamento
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

  // youWin — Jogador zerou o jogo (passou por todas as fases)
  youWin() {
    if(!this.running) return
    this.running = false
    this.won = true

    clearInterval(this.snapshotInterval)

    document.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        location.reload()
      }
    }, { once: true })
  }

  // drawYouWin — Desenha a tela de vitória em amarelo (mesmo estilo do Game Over)
  drawYouWin() {
    const cx = this.canvas.width / 2
    const cy = this.canvas.height / 2

    // Fundo escuro semi-transparente
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    // Texto "YOU WIN" grande em amarelo com borda preta
    this.ctx.textAlign = "center"
    this.ctx.font = "bold 72px Impact, Arial"

    this.ctx.strokeStyle = "black"
    this.ctx.lineWidth = 8
    this.ctx.strokeText("YOU WIN", cx, cy - 40)

    this.ctx.fillStyle = "#FFD700"
    this.ctx.fillText("YOU WIN", cx, cy - 40)

    // "Congratulations" abaixo em amarelo
    this.ctx.font = "bold 36px Impact, Arial"
    this.ctx.strokeStyle = "black"
    this.ctx.lineWidth = 4
    this.ctx.strokeText("Congratulations!", cx, cy + 15)
    this.ctx.fillStyle = "#FFD700"
    this.ctx.fillText("Congratulations!", cx, cy + 15)

    // Score abaixo em branco
    this.ctx.font = "bold 32px Impact, Arial"
    this.ctx.strokeStyle = "black"
    this.ctx.lineWidth = 4
    this.ctx.strokeText("Score: " + this.score, cx, cy + 60)
    this.ctx.fillStyle = "white"
    this.ctx.fillText("Score: " + this.score, cx, cy + 60)

    // Instrução para reiniciar
    this.ctx.font = "20px Arial"
    this.ctx.fillStyle = "#CCCCCC"
    this.ctx.fillText("Pressione ESPAÇO para reiniciar", cx, cy + 105)

    this.ctx.textAlign = "left"
  }

  //Esse metodo pega os resultados das predições e move o airplane evitando colidir com os obstaculos
  makeAirplaneMoveAwayObstacles(prediction) {
    if (prediction.label !== 'clock') {
      this.releaseFixedY()
      return
    }

    const obstacle = this.parseBBox(prediction.bbox)

    if (!this.isInDangerZone(obstacle) || !this.willCollideVertically(obstacle)) {
      this.releaseFixedY()
      return
    }

    this.fixedY = this.calcSafeY(obstacle)
  }

  // Extrai as bordas e tamanho do obstáculo a partir do bbox da predição
  parseBBox(bbox) {
    const x1 = bbox[0], y1 = bbox[1], x2 = bbox[2], y2 = bbox[3]
    const w = x2 - x1, h = y2 - y1
    const size = Math.max(w, h) // maior dimensão do obstáculo
    return { x1, y1, x2, y2, w, h, size }
  }

  // Verifica se o obstáculo está próximo o suficiente do player para reagir
  // Quanto maior o obstáculo, maior a zona de perigo
  isInDangerZone(obs) {
    const margin = 60 + obs.size * 0.5
    const dangerZone = 200 + obs.size * 1.5
    const playerRight = this.player.x + this.player.w
    return obs.x1 <= playerRight + dangerZone && obs.x2 >= this.player.x - margin
  }

  // Verifica se há risco de colisão no eixo vertical
  willCollideVertically(obs) {
    const margin = 60 + obs.size * 0.5
    return this.player.y < obs.y2 + margin &&
           this.player.y + this.player.h > obs.y1 - margin
  }

  // Calcula a posição Y segura para desviar do obstáculo
  calcSafeY(obs) {
    const margin = 60 + obs.size * 0.5
    const spaceAbove = obs.y1
    const spaceBelow = this.canvas.height - obs.y2

    let targetY
    if (spaceAbove >= spaceBelow) {
      targetY = obs.y1 - this.player.h - margin
    } else {
      targetY = obs.y2 + margin
    }

    return Math.max(0, Math.min(350, targetY))
  }

  // releaseFixedY — Libera o fixedY quando nenhum obstáculo está perto ou se aproximando do player
  releaseFixedY() {
    if (this.fixedY === null) return

    // Margem larga à direita (150px) para cobrir o deslocamento do obstáculo entre predições (200ms)
    const obstaclePassando = this.obstacles.some(o =>
      o.x < this.player.x + this.player.w + 150 &&
      o.x + o.w > this.player.x - 30
    )

    if (!obstaclePassando) {
      this.fixedY = null
    }
  }

  
}

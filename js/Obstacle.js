
/**
 * Obstacle.js — Classe de cada obstáculo (meteoro/aerólito).
 *
 * - Criado na borda direita do canvas (x = canvas.width).
 * - Largura fixa de 50px, altura aleatória entre 60 e 180px.
 * - Posição vertical (y) aleatória dentro do canvas.
 * - update(speed): move o obstáculo para a esquerda na velocidade recebida.
 * - draw(ctx): desenha o sprite de meteoro na posição atual.
 * - Quando x + w < 0 (saiu da tela), é removido pelo Game e conta como ponto.
 */

export default class Obstacle {

  // constructor — Cria um meteoro na borda direita do canvas com tamanho e posição aleatórios
  constructor(canvas) {
    this.canvas = canvas

    this.w = 50
    this.h = Math.random() * 120 + 60

    this.x = canvas.width
    this.y = Math.random() * (canvas.height - this.h) - 30

    // Ângulo de rotação aleatório para cada meteoro
    this.rotation = Math.random() * Math.PI * 2
    this.rotationSpeed = (Math.random() - 0.5) * 0.04

    this.sprite = new Image()            // Cria objeto de imagem
    this.sprite.src = "./assets/obstacle.png" // Carrega o sprite do obstáculo
  }

  // update — Move o obstáculo para a esquerda e rotaciona lentamente
  update(speed) {
    this.x -= speed
    this.rotation += this.rotationSpeed
  }

  // draw — Desenha o meteoro com rotação na posição atual
  draw(ctx) {
    ctx.save()
    const cx = this.x + this.w / 2
    const cy = this.y + this.h / 2
    ctx.translate(cx, cy)
    ctx.rotate(this.rotation)
    // O sprite tem padding de 12px em cada lado
    ctx.drawImage(this.sprite, -(this.w / 2 + 12), -(this.h / 2 + 12))
    ctx.restore()
  }

}


/**
 * Obstacle.js — Classe de cada obstáculo (meteoro/aerólito).
 *
 * - Criado na borda direita do canvas (x = canvas.width).
 * - Largura fixa de 50px, altura aleatória entre 60 e 180px.
 * - Posição vertical (y) aleatória dentro do canvas.
 * - update(speed): move o obstáculo para a esquerda na velocidade recebida.
 * - draw(ctx): desenha o sprite de meteoro na posição atual.
 * - Quando x + w < 0 (saiu da tela), é removido pelo Game e conta como ponto.
 * - Usa sprite PNG estático para consistência na detecção do YOLOv5.
 */

export default class Obstacle {

  // constructor — Cria um meteoro na borda direita do canvas com tamanho e posição aleatórios
  constructor(canvas) {
    this.canvas = canvas

    // Tamanho base aleatório entre 35 e 90px, proporção 1:1 (meteorito redondo)
    const size = Math.random() * 55 + 35
    this.w = size
    this.h = size // quadrado perfeito = redondo sem distorção

    this.x = canvas.width
    this.y = Math.random() * (canvas.height - this.h)

    this.sprite = new Image()
    this.sprite.src = "./assets/obstacle.png"

    this.angle = Math.random() * Math.PI * 2
    this.rotationSpeed = (Math.random() * 0.04 + 0.02) * (Math.random() < 0.5 ? 1 : -1)
  }

  // update — Move o obstáculo para a esquerda e rotaciona
  update(speed) {
    this.x -= speed
    this.angle += this.rotationSpeed
  }

  // draw — Desenha o sprite do meteoro rotacionado em torno do seu centro
  draw(ctx) {
    if (this.sprite.complete) {
      const cx = this.x + this.w / 2
      const cy = this.y + this.h / 2
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(this.angle)
      ctx.drawImage(this.sprite, -this.w / 2, -this.h / 2, this.w, this.h)
      ctx.restore()
    }
  }

}

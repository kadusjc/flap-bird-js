
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
  }

  // update — Move o obstáculo para a esquerda na velocidade recebida do LevelManager
  update(speed) {
    this.x -= speed
  }

  // draw — Desenha o sprite do meteoro na posição atual (sem rotação, alinhado à hitbox AABB)
  draw(ctx) {
    if (this.sprite.complete) {
      ctx.drawImage(this.sprite, this.x, this.y, this.w, this.h)
    }
  }

}

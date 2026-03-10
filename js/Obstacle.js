
/**
 * Obstacle.js — Classe de cada obstáculo.
 *
 * - Criado na borda direita do canvas (x = canvas.width).
 * - Largura fixa de 50px, altura aleatória entre 60 e 180px.
 * - Posição vertical (y) aleatória dentro do canvas.
 * - update(speed): move o obstáculo para a esquerda na velocidade recebida.
 * - draw(ctx): desenha o sprite do obstáculo na posição atual.
 * - Quando x + w < 0 (saiu da tela), é removido pelo Game e conta como ponto.
 */

export default class Obstacle {

  // constructor — Cria um obstáculo na borda direita do canvas com tamanho e posição aleatórios
  constructor(canvas) {
    this.canvas = canvas // Referência ao canvas para saber as dimensões

    this.w = 50                        // Largura fixa de 50px
    this.h = Math.random() * 120 + 60  // Altura aleatória entre 60 e 180px

    this.x = canvas.width // Nasce na borda direita da tela (vai se mover para a esquerda)

    // Posição vertical aleatória, garantindo que caiba dentro do canvas
    this.y = Math.random() * (canvas.height - this.h) - 30

    this.sprite = new Image()                // Cria objeto de imagem
    this.sprite.src = "./assets/obstacle.png" // Carrega o sprite do obstáculo
  }

  // update — Move o obstáculo para a esquerda na velocidade recebida do LevelManager
  update(speed) {
    this.x -= speed // Subtrai a velocidade do x (move para a esquerda a cada frame)
  }

  // draw — Desenha o sprite do obstáculo na posição atual
  draw(ctx) {
    if (this.sprite.complete) { // Só desenha se a imagem já carregou
      ctx.drawImage(this.sprite, this.x, this.y, this.w, this.h) // Desenha na posição (x,y) com tamanho (w,h)
    }
  }

}

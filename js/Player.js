
/**
 * Player.js — Classe do jogador (o "pássaro").
 *
 * - Posição fixa em x=80, y inicial=200, tamanho 60x40.
 * - vy: velocidade vertical. A cada update(), sofre gravidade (vy += 0.5)
 *   e a posição y é atualizada (y += vy).
 * - jump(): define vy = -10, fazendo o jogador subir.
 * - Limites: não sobe acima de y=0, não desce abaixo de y=350 (chão).
 * - draw(): desenha o sprite do jogador na posição atual.
 */

export default class Player {

  // constructor — Define posição inicial, tamanho, velocidade e carrega o sprite
  constructor() {
    this.x = 80    // Posição horizontal fixa (o jogador não anda, os obstáculos vêm até ele)
    this.y = 200   // Posição vertical inicial (meio da tela)

    this.w = 60    // Largura do jogador em pixels
    this.h = 40    // Altura do jogador em pixels

    this.vy = 0    // Velocidade vertical (positivo = caindo, negativo = subindo)

    this.sprite = new Image()            // Cria objeto de imagem
    this.sprite.src = "./assets/player.png" // Carrega o sprite do jogador
  }

  // jump — Chamado quando o jogador pressiona Espaço. Define vy negativa para subir.
  jump() {
    this.vy = -10 // Impulso para cima (valor negativo = sobe no canvas)
  }

  // update — Atualiza a posição vertical a cada frame aplicando gravidade
  update() {
    this.vy += 0.5  // Gravidade: acelera para baixo a cada frame
    this.y += this.vy // Atualiza a posição Y com a velocidade atual

    if (this.y < 0) this.y = 0 // Impede de sair pelo topo da tela

    if (this.y > 350) {  // Impede de cair abaixo do chão (y=350)
      this.y = 350       // Fixa no chão
      this.vy = 0        // Zera a velocidade ao tocar o chão
    }
  }

  // draw — Desenha o sprite do jogador na posição atual
  draw(ctx) {
    if (this.sprite.complete) { // Só desenha se a imagem já terminou de carregar
      ctx.drawImage(this.sprite, this.x, this.y, this.w, this.h) // Desenha na posição (x,y) com tamanho (w,h)
    }
  }

}

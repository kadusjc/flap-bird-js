
/**
 * Input.js — Gerenciador de entrada do teclado.
 *
 * No constructor, registra um event listener global para "keydown".
 * Quando a tecla Espaço (Space) é pressionada, chama player.jump()
 * para fazer o jogador pular.
 */

export default class Input {

  constructor(player) {
    document.addEventListener("keydown", e => {
      if (e.code === "Space") {
        player.jump()
      }
    })
  }

}

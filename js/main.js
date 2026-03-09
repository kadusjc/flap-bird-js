
/**
 * main.js — Ponto de entrada do jogo.
 *
 * 1. Obtém o elemento <canvas> e seu contexto 2D para desenho.
 * 2. Cria a instância principal do jogo (Game).
 * 3. Define o game loop usando requestAnimationFrame:
 *    - game.update() → atualiza toda a lógica (posições, colisões, score)
 *    - game.draw()   → redesenha tudo na tela
 *    - requestAnimationFrame(loop) → agenda a próxima execução de loop()
 *      sincronizada com a taxa de atualização do monitor (~60fps).
 *      Isso cria um ciclo infinito: loop → update → draw → requestAnimationFrame → loop ...
 * 4. Chama loop() uma primeira vez para iniciar o ciclo.
 */

import Game from "./Game.js" // Importa a classe principal do jogo

const canvas = document.getElementById("game") // Busca o elemento <canvas id="game"> no HTML
const ctx = canvas.getContext("2d") // Obtém o contexto 2D usado para desenhar no canvas

const game = new Game(canvas, ctx) // Cria a instância do jogo passando canvas e contexto

// Game loop: função que roda infinitamente a ~60fps
function loop() {
  game.update()              // Atualiza toda a lógica do jogo (posições, colisões, score)
  game.draw()                // Redesenha todos os elementos na tela
  requestAnimationFrame(loop) // Agenda a próxima chamada de loop() no próximo frame do navegador
}

loop() // Inicia o game loop pela primeira vez

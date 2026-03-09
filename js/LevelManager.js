
/**
 * LevelManager.js — Gerenciador de dificuldade/níveis.
 *
 * - Possui 8 níveis, cada um com velocidade (speed) e taxa de spawn (spawn) crescentes.
 * - speed(): retorna a velocidade dos obstáculos no nível atual.
 * - spawnRate(): retorna o intervalo em frames para gerar novos obstáculos.
 *   (quanto menor, mais frequente o spawn).
 * - update(score): a cada 10 pontos, sobe de nível (até o nível 8)
 *   e exibe um alerta informando o novo nível.
 */

export default class LevelManager {

  constructor() {
    this.level = 1

    this.levels = [
      { speed: 3, spawn: 120 },
      { speed: 3.5, spawn: 110 },
      { speed: 4, spawn: 100 },
      { speed: 4.5, spawn: 90 },
      { speed: 5, spawn: 80 },
      { speed: 5.5, spawn: 70 },
      { speed: 6, spawn: 60 },
      { speed: 7, spawn: 50 }
    ]
  }

  speed() {
    return this.levels[this.level - 1].speed
  }

  spawnRate() {
    return this.levels[this.level - 1].spawn
  }

  update(score) {
    if (score % 10 === 0 && this.level < 8) {
      this.level++
      alert("Level " + this.level)
    }
  }

}

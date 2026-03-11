/**
 * Evasion.js — Classe dedicada à lógica de evasão da IA.
 *
 * Responsabilidades:
 * - Processar predições YOLO (bbox) e decidir posição segura para o player.
 * - Compensar latência do snapshot + inferência YOLO para posição X dos obstáculos.
 * - Evasão principal via YOLO (makeAirplaneMoveAwayObstacles).
 * - Evasão de emergência frame-a-frame (emergencyEvade).
 * - Última linha de defesa com predições YOLO (lastResortEvade).
 * - Controle do fixedY (travar/liberar posição do player durante desvio).
 *
 * Recebe referência ao Game para acessar: player, obstacles, predictions, levelManager, canvas.
 */

export default class Evasion {

  constructor(game) {
    this.game = game
  }

  // Atalhos para propriedades do game
  get player()       { return this.game.player }
  get predictions()  { return this.game.predictions }
  get levelManager() { return this.game.levelManager }
  get canvas()       { return this.game.canvas }

  get fixedY()       { return this.game.fixedY }
  set fixedY(v)      { this.game.fixedY = v }

  // ─── YOLO Evasion (trigger principal) ──────────────────────────────────────
  // O YOLO está identificando meus meteoros como "clock" e às vezes "stop sign". Vou focar na label "clock" para as evasões, pois é a mais consistente. 
  // A função makeAirplaneMoveAwayObstacles() é chamada a cada frame para processar as predições YOLO e decidir se o player precisa se mover para evitar uma colisão. Ela verifica se há obstáculos próximos com base nas predições, calcula uma posição Y segura para desviar e atualiza fixedY. Se não houver perigo, ela libera o fixedY para permitir que o player retorne ao centro.
  // Processa predição YOLO e move o player para evitar colisão
  makeAirplaneMoveAwayObstacles(prediction) {
    if (!['clock', 'stop sign'].includes(prediction.label)) {
      // Predição de player (kite/airplane) ou outra — NÃO libera fixedY aqui.
      // A liberação é feita naturalmente pelo releaseFixedY() quando o caminho está livre.
      return
    }

    const obstacle = this.parseBBox(prediction.bbox)

    // Compensa o movimento desde o snapshot: o obstáculo já se moveu para a esquerda
    const latestPred = this.predictions[this.predictions.length - 1]
    if (latestPred && latestPred.snapshotTime) {
      const elapsed = (performance.now() - latestPred.snapshotTime) / 1000
      const moved = this.levelManager.speed() * 60 * elapsed
      obstacle.x1 -= moved
      obstacle.x2 -= moved
    }

    if (!this.isInDangerZone(obstacle) || !this.willCollideVertically(obstacle)) {
      this.releaseFixedY()
      return
    }

    let safeY = this.calcSafeY(obstacle)

    // Validação final: verifica se a posição calculada colide com alguma outra predição YOLO
    if (!this.isPositionSafeFromPredictions(safeY)) {
      safeY = this.findSafeYFromPredictions()
    }

    this.fixedY = safeY
  }

  // ─── Parsing e análise de bbox ─────────────────────────────────────────────

  // Extrai as bordas e tamanho do obstáculo a partir do bbox da predição
  parseBBox(bbox) {
    const x1 = bbox[0], y1 = bbox[1], x2 = bbox[2], y2 = bbox[3]
    const w = x2 - x1, h = y2 - y1
    const size = Math.max(w, h)
    return { x1, y1, x2, y2, w, h, size }
  }

  // Verifica se o obstáculo está próximo o suficiente do player para reagir
  isInDangerZone(obs) {
    const margin = 80 + obs.size * 0.6
    const dangerZone = 260 + obs.size * 1.8
    const playerRight = this.player.x + this.player.w
    return obs.x1 <= playerRight + dangerZone && obs.x2 >= this.player.x - margin
  }

  // Verifica se há risco de colisão no eixo vertical
  willCollideVertically(obs) {
    const margin = 80 + obs.size * 0.6
    return this.player.y < obs.y2 + margin &&
           this.player.y + this.player.h > obs.y1 - margin
  }

  // ─── Cálculo de posição segura ─────────────────────────────────────────────

  // Calcula a posição Y segura para desviar do obstáculo
  calcSafeY(obs) {
    const margin = 80 + obs.size * 0.6

    const aboveY = Math.max(0, obs.y1 - this.player.h - margin)
    const belowY = Math.min(350, obs.y2 + margin)

    const aboveSafe = aboveY + this.player.h <= obs.y1
    const belowSafe = belowY >= obs.y2

    // Se já está evadindo, tenta manter a mesma direção para não oscilar
    if (this.fixedY !== null) {
      if (this.fixedY < obs.y1) {
        if (aboveSafe) return aboveY
        if (belowSafe) return belowY
      } else {
        if (belowSafe) return belowY
        if (aboveSafe) return aboveY
      }
    }

    const spaceAbove = obs.y1
    const spaceBelow = this.canvas.height - obs.y2

    if (spaceAbove >= spaceBelow) {
      if (aboveSafe) return aboveY
      if (belowSafe) return belowY
    } else {
      if (belowSafe) return belowY
      if (aboveSafe) return aboveY
    }

    return aboveY
  }

  // ─── Predições YOLO compensadas ────────────────────────────────────────────
  //    Para o YOLO, meus meteoros estão sendo identificados como "clock" as vezes "stop sign" (relógio). Vou focar na label "clock" para as evasões, pois é a mais consistente. 
  //    A função getObstaclePredictions() filtra as predições para retornar apenas as que têm a label "clock", e também compensa o movimento do obstáculo desde o momento do snapshot até o momento atual, 
  // usando a velocidade do nível e o tempo decorrido. Isso me dá uma estimativa mais precisa da posição atual dos obstáculos, mesmo com a latência do processamento YOLO.
  //    Retorna as predições YOLO filtradas (apenas 'clock') com compensação de movimento
  getObstaclePredictions() {
    const now = performance.now()
    const speed = this.levelManager.speed()
    const fps = 60
    return this.predictions
      .filter(p => p.label === 'clock' || p.label === 'stop sign') // Inclui "stop sign" como alternativa
      .sort((a, b) => a.snapshotTime - b.snapshotTime)
      .map(p => {
        const [x1, y1, x2, y2] = p.bbox
        const elapsed = (now - p.snapshotTime) / 1000
        const moved = speed * fps * elapsed
        return { x: x1 - moved, y: y1, w: x2 - x1, h: y2 - y1 }
      })
      .filter(o => o.x + o.w > 0)
  }

  // Verifica se uma posição Y NÃO colide com nenhuma predição YOLO próxima
  isPositionSafeFromPredictions(y) {
    const speed = this.levelManager.speed()
    const buffer = 15 + speed * 2
    const playerTop = y - buffer
    const playerBottom = y + this.player.h + buffer
    const obstacles = this.getObstaclePredictions()
    const lookAhead = 160 + speed * 20
    return !obstacles.some(o =>
      o.x < this.player.x + this.player.w + lookAhead &&
      o.x + o.w > this.player.x - 40 &&
      playerTop < o.y + o.h &&
      playerBottom > o.y
    )
  }

  // Calcula uma posição Y segura usando as predições YOLO
  findSafeYFromPredictions() {
    const speed = this.levelManager.speed()
    const lookAhead = 200 + speed * 20
    const nearby = this.getObstaclePredictions().filter(o =>
      o.x < this.player.x + this.player.w + lookAhead &&
      o.x + o.w > this.player.x - 60
    )

    const margin = 35
    const candidates = [0, 100, 175, 250, 350]
    for (const o of nearby) {
      candidates.push(o.y - this.player.h - margin)
      candidates.push(o.y + o.h + margin)
    }

    const safe = candidates
      .map(y => Math.max(0, Math.min(350, y)))
      .filter(y => this.isPositionSafeFromPredictions(y))

    if (safe.length === 0) {
      if (nearby.length > 0) {
        const avgY = nearby.reduce((sum, o) => sum + o.y + o.h / 2, 0) / nearby.length
        return avgY < 200 ? 350 : 0
      }
      return 175
    }

    const currentY = this.fixedY !== null ? this.fixedY : this.player.y
    safe.sort((a, b) => Math.abs(a - currentY) - Math.abs(b - currentY))
    return safe[0]
  }

  // ─── Evasão de emergência (frame-a-frame) ──────────────────────────────────

  // Verifica predições YOLO muito próximas quando fixedY está null
  emergencyEvade() {
    const speed = this.levelManager.speed()
    const emergencyDist = 120 + speed * 15 // speed 7 → 225px
    const obstacles = this.getObstaclePredictions()
    const threat = obstacles.find(o =>
      o.x < this.player.x + this.player.w + emergencyDist &&
      o.x + o.w > this.player.x - 20 &&
      this.player.y < o.y + o.h &&
      this.player.y + this.player.h > o.y
    )

    if (!threat) return

    this.fixedY = this.findSafeYFromPredictions()
    this.player.y = this.fixedY
    this.player.vy = 0
  }

  // ─── Última linha de defesa (predições YOLO) ──────────────────────────────

  // Verifica predições YOLO muito próximas do player (safety net)
  lastResortEvade() {
    const px = this.player.x, pw = this.player.w
    const py = this.player.y, ph = this.player.h
    const speed = this.levelManager.speed()
    const range = 40 + speed * 8 // speed 7 → 96px
    const obstacles = this.getObstaclePredictions()

    for (const o of obstacles) {
      if (o.x > px + pw + range || o.x + o.w < px - 10) continue
      if (py >= o.y + o.h || py + ph <= o.y) continue

      const aboveY = Math.max(0, o.y - ph - 10)
      const belowY = Math.min(350, o.y + o.h + 10)

      const aboveSafe = this.isYSafeFromPredictions(aboveY, obstacles)
      const belowSafe = this.isYSafeFromPredictions(belowY, obstacles)

      let newY
      if (aboveSafe && belowSafe) {
        newY = Math.abs(py - aboveY) <= Math.abs(py - belowY) ? aboveY : belowY
      } else if (aboveSafe) {
        newY = aboveY
      } else if (belowSafe) {
        newY = belowY
      } else {
        continue
      }

      this.player.y = newY
      this.fixedY = newY
      this.player.vy = 0
      return
    }
  }

  // Verifica se uma posição Y é segura em relação às predições próximas
  isYSafeFromPredictions(y, obstacles) {
    const px = this.player.x, pw = this.player.w, ph = this.player.h
    const range = 40 + this.levelManager.speed() * 8
    return !obstacles.some(o =>
      o.x < px + pw + range &&
      o.x + o.w > px - 10 &&
      y < o.y + o.h &&
      y + ph > o.y
    )
  }

  // ─── Controle do fixedY ────────────────────────────────────────────────────

  // Libera o fixedY quando nenhum obstáculo está perto ou se aproximando do player
  releaseFixedY() {
    if (this.fixedY === null) return

    const speed = this.levelManager.speed()
    const passRange = 220 + speed * 20 // speed 7 → 360px
    const obstacles = this.getObstaclePredictions()
    const isObstaclePassing = obstacles.some(o =>
      o.x < this.player.x + this.player.w + passRange &&
      o.x + o.w > this.player.x - 60
    )

    if (isObstaclePassing) return

    const fallZoneTop = this.fixedY
    const fallZoneBottom = 350 + this.player.h
    const isObstacleInTheGround = obstacles.some(o =>
      o.x < this.player.x + this.player.w + passRange &&
      o.x + o.w > this.player.x - 40 &&
      o.y + o.h > fallZoneTop &&
      o.y < fallZoneBottom
    )

    if (!isObstacleInTheGround) {
      this.fixedY = null
    }
  }

  // ─── Revalidação do fixedY (chamada a cada frame) ──────────────────────────

  // Verifica se fixedY ainda é seguro; se não, recalcula. Também tenta liberar se o caminho está livre.
  revalidateFixedY() {
    if (this.fixedY === null) return false

    // Tenta liberar o fixedY se não há mais obstáculos próximos
    this.releaseFixedY()
    if (this.fixedY === null) return false

    if (!this.isPositionSafeFromPredictions(this.fixedY)) {
      this.fixedY = this.findSafeYFromPredictions()
    }
    return true
  }
}

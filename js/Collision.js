
/**
 * Collision.js — Detecção de colisão entre dois retângulos (AABB).
 *
 * Recebe dois objetos (a, b) com propriedades { x, y, w, h }.
 * Retorna true se os retângulos se sobrepõem, usando a técnica
 * Axis-Aligned Bounding Box (AABB):
 *   - a.x < b.x + b.w  → a borda esquerda de A está antes da borda direita de B
 *   - a.x + a.w > b.x  → a borda direita de A está depois da borda esquerda de B
 *   - a.y < b.y + b.h  → a borda superior de A está acima da borda inferior de B
 *   - a.y + a.h > b.y  → a borda inferior de A está abaixo da borda superior de B
 * Se todas as 4 condições são verdadeiras, há colisão.
 */

// collide — Detecta colisão entre dois retângulos usando AABB (Axis-Aligned Bounding Box)
// Recebe dois objetos com { x, y, w, h } e retorna true se estão sobrepostos
export default function collide(a, b) {
  return (
    a.x < b.x + b.w &&   // Borda esquerda de A está antes da borda direita de B?
    a.x + a.w > b.x &&   // Borda direita de A está depois da borda esquerda de B?
    a.y < b.y + b.h &&   // Borda superior de A está acima da borda inferior de B?
    a.y + a.h > b.y      // Borda inferior de A está abaixo da borda superior de B?
  ) // Se TODAS forem true → os retângulos se sobrepõem → colisão!
}

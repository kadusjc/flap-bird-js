# Flap Bird JS

Joguinho simples feito em JavaScript puro (Canvas 2D), criado para aplicar o conteúdo da aula da minha Pós-Graduação em Inteligência Artificial.

## Sobre o Jogo

O jogador controla um pássaro que precisa desviar de obstáculos que surgem pela direita da tela. A dificuldade aumenta progressivamente a cada 10 pontos, com obstáculos mais rápidos e mais frequentes (8 níveis no total).

**Controles:** Pressione `Espaço` para pular.

## Objetivo com IA

Usar **YOLO** para identificar os obstáculos na tela e fazer a IA ganhar o jogo sozinha — reconhecendo os objetos e jogando automaticamente sem intervenção humana.

## Como Executar

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/flap-bird-ia.git
   cd flap-bird-ia
   ```

2. Abra o arquivo `index.html` no navegador:
   ```bash
   # Opção 1: abrir direto
   open index.html

   # Opção 2: usar um servidor local (recomendado)
   npx serve .
   ```

3. Pronto! O jogo inicia automaticamente no navegador.

## Estrutura do Projeto

```
index.html          → Página principal com o <canvas>
assets/             → Sprites (jogador, obstáculo, fundo)
js/
  main.js           → Ponto de entrada e game loop
  Game.js           → Classe principal que orquestra tudo
  Player.js         → Jogador (gravidade, pulo, limites)
  Obstacle.js       → Obstáculos (criação, movimento)
  Collision.js      → Detecção de colisão AABB
  Input.js          → Captura de tecla (Espaço → pulo)
  LevelManager.js   → Sistema de níveis e dificuldade
```

Nessa Branch, temos apenas o Jogo rodando, dependendo do jogador. A IA virá numa próxima branch
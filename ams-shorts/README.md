# AMS Shorts — motor de edição de vídeos curtos do Anime Mining Simulator

Gera shorts verticais (1080×1920, 30 fps, áudio a −14 LUFS) prontos para TikTok, Reels e Shorts, com edição feita por código: hook, impact frames, speed ramps, punch-ins, textos, números de dano, barra de HP, música phonk e SFX sincronizados ao frame, além de CTA final.

Funciona em dois modos:

| Modo | O que é | Quando usar |
|---|---|---|
| **3D estilizado** (`build.mjs`) | Recriação 3D estilo Roblox (avatar, minérios, Units, ilhas) renderizada pelo próprio motor | Animatic, referência de edição, teste de hook/roteiro antes de gravar |
| **Footage real** (`footage.mjs`) | Mesma edição aplicada por cima das suas gravações do OBS | **Versão para publicar** |

> ⚠️ **Verdade do produto.** A versão 3D **não é gameplay real do AMS**: modelos, VFX e números (dano, HP, chance, tempos) são placeholders. A regra da sua própria planilha ("Gameplay, UI, models e VFX reais. Nada que o jogo não tenha") vale aqui. Publique as versões feitas com footage real e use os valores reais do jogo.

---

## Os 3 vídeos

| ID | Nome | Duração | Motor psicológico | Estrutura |
|---|---|---|---|---|
| V001 | **0 → OP** | 12 s | progressão | resultado primeiro (impact frame) → rewind → "essa era minha picareta há 10 min" → 3 upgrades no beat (contador de dano 1 → 999K) → "1 HIT?" silêncio + riser → slam → CTA |
| V002 | **Comum vs Mítico** | 15 s | comparação | split-screen, mesmo minério → "VAI!" → mítica quebra em 0:03.2 → time-lapse 50x da comum (mítica dorme) → 2:47.9 → "52x MAIS RÁPIDO" → "QUAL VOCÊ USARIA?" → CTA |
| V006 | **O minério mais raro** | 9 s | raridade + loop | hero frame com chance → mineração → punch-ins em 49%/27%/12% com batimento cardíaco → quebra com impact frame → "SECRETO!" → CTA → último frame = primeiro (loop) |

Cada um existe em PT e EN (`out/AMS_<id>_<pt|en>.mp4`).

---

## Instalação no PC (Windows/Mac/Linux)

1. **Node.js 20+**: https://nodejs.org
2. **Python 3.10+** e depois `pip install numpy scipy`
3. **FFmpeg** no PATH. No Windows: `winget install Gyan.FFmpeg`
4. Na pasta do projeto:
   ```bash
   npm install
   npx playwright install chromium
   ```

Se o PC tem placa de vídeo, use `AMS_GPU=1` para renderizar muito mais rápido. No PowerShell: `$env:AMS_GPU=1`.

## Comandos

```bash
# vídeos 3D estilizados
node build.mjs v001 pt    # -> out/AMS_v001_pt.mp4   (v001 | v002 | v006,  pt | en)
node render.mjs v001 pt --stills 0,1.5,8.0   # frames soltos para revisar (out/stills)

# footage real (versão para publicar)
node footage.mjs edl/templates/V001_0_a_OP_real.json   # -> out/AMS_V001_0_a_OP_real_pt.mp4
```

Tudo roda em Node (Windows, Mac e Linux); o Python é chamado automaticamente para o áudio.

---

## Gravando no OBS

- **Vídeo:** resolução base e de saída iguais às do monitor (1920×1080 ou, melhor, 2560×1440), **60 FPS**.
- **Gravação:** MKV (ou Hybrid MP4), encoder de hardware (NVENC/AMF/QSV), **CQP 16–18**, keyframe de 1 s.
- **Áudio:** áudio do jogo em faixa própria, microfone desligado.
- **Roblox:** gráficos no máximo, ação **sempre no centro** (o recorte 9:16 sai do meio; ajuste `cropX` se precisar) e **Shift+P (Freecam)** para planos limpos sem HUD.
- Grave cada take com uns 2 s de folga antes e depois. O `in` do EDL escolhe o ponto exato.

### Takes por vídeo

**V001 — 0 → OP**: (1) melhor picareta acertando o minério mais forte; (2) picareta inicial batendo 2× num minério inicial; (3–5) equipar picareta rara, épica e lendária e minerar em ilhas diferentes; (6) equipar a melhor picareta, carregar e golpear; (7) freecam orbitando o avatar.

**V002 — Comum vs Mítico**: o mesmo minério e a mesma câmera travada nos dois testes, cronometrando do primeiro golpe até quebrar. Um take com a Unit comum, outro com a mítica.

**V006 — Minério mais raro**: (1) freecam orbitando o minério raro; (2) mineração completa com HUD de HP visível; (3) quebra e drop. Termine com o mesmo enquadramento do take 1 (loop).

---

## EDL (o arquivo JSON do corte)

Os templates em `edl/templates/` têm `_nota` explicando cada clip. Campos:

| Campo | Exemplo | Significado |
|---|---|---|
| `clips[].file` / `in` | `"footage/x.mkv"`, `12.5` | arquivo e segundo de início no arquivo |
| `t0` / `t1` | `2.4`, `4.0` | posição do clip no vídeo final (s) |
| `speed` | `1`, `0.3` ou `[[8.0,1],[8.02,0.3],[9.0,0.3]]` | velocidade fixa ou rampa (keyframes no tempo do vídeo) |
| `zoom` | `1.1` ou `[1.15, 1.0]` ou keyframes | zoom sobre o recorte 9:16 |
| `cropX` / `cropY` | `0.5` ou `[0.35, 0.65]` | centro do recorte (0 = esquerda, 1 = direita) |
| `audio` | `0.8` | volume do som original do jogo (0 = mudo; só em velocidade 1) |
| `bottom` | `{ "file": ..., "in": ... }` | **tela dividida**: este vira a metade de baixo |
| `fx[]` | `{ "t": 8.0, "type": "impact" }` | `impact` (impact frames + punch + shake), `flash`, `cut`, `rewind` |
| `layers[]` | `{ "type": "text", ... }` | `text`, `badge`, `caption`, `timer`, `vs`, `rays`, `speedlines`, `endcard` |
| `sfx[]` | `{ "t": 8.0, "name": "impact_huge" }` | ver lista abaixo |
| `music` | `{ "bpm": 150, "sections": [...] }` | modos: `full`, `drop`, `muffled`, `tension`, `outro` |

Estilos de `fill`: `white`, `yellow`, `red`, `green`, `pink`, `cyan`, `rainbow` ou `["#topo", "#base"]`.
Animações de `text`: `pop` (padrão), `stamp` (slam), `none` (já visível no frame 0, ideal para o hook).

**SFX disponíveis:** `hit`, `tink`, `break`, `break_big`, `impact_huge`, `sub_drop`, `crit`, `rewind`, `whoosh`, `whoosh_in`, `equip` (tier: rare/epic/legendary/mythic), `count_up`, `riser`, `charge`, `pop`, `stamp`, `reward_flurry`, `logo_hit`, `punch`, `beam`, `tick`, `heartbeat`, `glitch`, `vs`, `ding`, `shimmer`, `drone`.

Dica de ritmo: a música é 150 BPM, então **1 batida = 0,4 s e 1 compasso = 1,6 s**. Cortes e golpes nesses múltiplos (contando do início da seção) caem no beat.

Toda música e todo SFX são sintetizados por código (`audio/synth.py`): nada de áudio licenciado, sem risco de copyright.

---

## Áreas seguras (TikTok/Reels/Shorts)

Textos principais ficam entre y = 200 e y = 1480 e x ≤ 930 (`SAFE` em `src/lib/overlay.js`). Abaixo de 1480 fica a legenda do post, e à direita os botões.

## Medição (da planilha AMS_Content_Engine)

Publique cada vídeo com um **Roblox Share Link** próprio por plataforma, vídeo e variante (ex.: `TT_AMS_V001_HA`) e registre na aba `Analytics_Log`. Compare **Joins/Views** e **Qualified/Views**, não views isoladas.

## Estrutura

```
src/lib/        motor: ambientes, minérios (rachaduras procedurais), atores, partículas, pós (bloom, CA, impact frames), camada 2D
src/videos/     v001/v002/v006 (.timeline.js = roteiro e cues de áudio; .js = cena e edição), footage.js (modo real)
audio/synth.py  música + SFX + limiter
edl/templates/  cortes prontos para footage real
```

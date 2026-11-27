# 🍡 Last Mochi Standing

**Puff, Dash & Bowl Café Brawler · 2–4 Players + Bots**

A fast-paced, zero-dependency HTML5 Canvas party brawler set inside a cozy 2.5D Japanese dessert café. Launch unique dessert snacks to puff rivals into squishy **Mochi Balls**, then Belly-Dash or bowl them into tables and café counters for a KO!

**Live Site:** [mochi.omiharjani.com](https://mochi.omiharjani.com)

---

## 🎮 How to Play (Puff, Dash & Bowl!)

Unlike traditional maze bombers where every blast is identical and instant-lethal, **Last Mochi Standing** revolves around a 3-step party brawler loop:

1. **Splash Rivals (`Space` / `Enter`):** Drop your character's unique dessert snack. Your own splash **never** puffs you — instead, standing on your own pop gives you a harmless **`HOP!`**!
2. **Puff into a Mochi Ball (`4s`):** Rivals caught in a splash puff into an oversized **Mochi Ball** for 4 seconds. Puffed players can mash Action/Dash or move keys to wiggle free faster and bounce back!
3. **Dash & Bowl KO (`Shift` / `E`):** Bump or **Belly-Dash** into a puffed Mochi Ball (or smash it with another snack!) to bowl it across the arena into café tables, counters, or other players for a knockout. Bouncing off **Sakura Zabuton Cushions** ricochets rolled balls 90° around corners!
4. **Ghost Waiter Revenge:** Knocked-out players patrol the wooden café perimeter counter as **Ghost Waiters**, aiming and lobbing mini cloche snacks anywhere onto the floor to disrupt the remaining survivors.

---

## 🐾 Playable Characters

| Character | Animal | Snack Attack | Role & Signature Ability |
| :--- | :--- | :--- | :--- |
| **Mochi (もち)** | Shiba Inu | **Matcha Boba** (`1.58s` fuse) | **Ranged Slider:** Slides boba 2 tiles forward on placement and fires a bouncing matcha tapioca pearl on detonation. |
| **Tama (たま)** | Calico Cat | **Caramel Pudding** (`1.92s` fuse) | **3×3 Vortex Pull:** Explodes in a 3×3 caramel splash, pulls nearby rivals & power-ups inward, and leaves a slowing caramel floor zone. |
| **Yuzu (ゆず)** | Capybara | **Yuzu Mochi** (`1.56s` fuse) | **8-Way Star + Jump:** Pops in an 8-way star shape and leaves a bouncy yuzu jelly cushion that vaults players over obstacles. |
| **Poko (ぽこ)** | Lop Bunny | **Berry Cream Puff** (`1.30s` fuse) | **Cone Wave Pusher:** Blasts a fast directional fizzy cone wave that pushes rivals and bowls stationary Mochi Balls forward. |

---

## 🌟 Café Events & Power-Ups

### Mid-Round Café Events
- **Golden Daifuku Steamer:** Periodically steams up in the center tatami zone — grabbing the crowned **Golden Daifuku** grants **Sugar Rush** (`+25%` speed, `+2` blast range, faster Dash cooldown, and a **Cream Shield**).
- **Kaiten-Zushi Conveyor Belt:** Triggers at `55s` remaining — conveyor lanes move players and snacks along rows 4 and 8 for `12s`.
- **Closing Time Crates:** Triggers at `25s` remaining — inward-spiraling pink pastry crates fall onto the arena, clearing any remaining contenders caught underneath.

### Doily Coaster Power-Ups
- **Matcha Boba Cup (`+1 Snack`):** Hold an extra active snack at once (up to 2).
- **Golden Star (`+1 Splash`):** Increases snack blast reach.
- **Winged Skate (`Zoomies`):** Boosts movement speed.
- **Striker Boot (`Snack Kick`):** Kick stationary snacks across the café floor.
- **Cream Shield (`🛡️`):** Absorbs one snack puff hit.

---

## ⌨️ Controls & Audio

Full **English (`EN`)** and **Japanese (`日本語`)** UI switching is built in, along with procedural Web Audio **Cozy Café BGM** and sound effects.

### Keyboard Controls (up to 4 local human players)

| Slot | Move | Place Snack / Wiggle / Ghost Lob | Belly-Dash / Wiggle |
| :--- | :--- | :--- | :--- |
| **Player 1** | `W` `A` `S` `D` *(plus `Arrows` in 1-Human mode)* | `Space` | `Left/Right Shift` or `E` |
| **Player 2** | `Arrow Keys` | `Enter` or `/` | `.`, `Right Ctrl`, or `'` |
| **Player 3** | `I` `J` `K` `L` | `U` | `O` |
| **Player 4** | `T` `F` `G` `H` / `Numpad 8 4 5 6` | `R` / `Numpad 0` | `Y` / `Numpad .` |

### Gamepad & Global Shortcuts
- **Zero-Mouse USB / Bluetooth Controller Support (DualSense, Xbox, Switch):**
  - **Lobby:** Connect 1–4 controllers and press **any button** (or move a stick) to join a slot! Press **L1 / R1** (`LB / RB`) to switch between open `P1`–`P4` slots (vacated slots become Bots), **Left Stick / D-Pad ◀▶** to pick a character, **✕ / A** to Ready Up (match auto-starts once everyone joined is ready, or press **✕ / Options** to start right away), **○ / B** to unready or leave, **□ / X** to cycle Bot difficulty (`Chill Bot` / `Clever Bot` / `Off`), and **△ / Y** to toggle Match Length (`First to 2` / `First to 3`).
  - **Mixed Controllers + Keyboard (e.g., 3 Controllers + 1 Keyboard):** In the lobby, press **`Space` / `Enter`** on the keyboard to claim an open slot, **`A`/`D`** or **`◀`/`▶`** to pick a character, and **`Space` / `Enter`** to Ready Up (**`Esc` / `Backspace`** to unready/leave). A sole keyboard player in any seat (`P1`–`P4`) automatically gets **`WASD` / `Arrows` + `Space`/`Enter` + `Shift`/`E`** without interfering with controller players.
- **iPhone / Mobile Touch Controls (Landscape & Portrait):**
  - Open in iOS Safari (or tap Share → **Add to Home Screen** for full-screen play) and rotate to **Landscape** for a handheld layout: a floating **Left Thumbstick** and right-hand **🧁 Snack** + **💨 Dash** buttons flank the unobstructed café arena. Portrait is also supported with touch controls stacked below the board, and touch buttons auto-hide whenever a Bluetooth controller is connected (or toggle manually via `🕹️`).
  - **In-Match:** **Left Stick / D-Pad** to move, **✕ / □** (`buttons[0]`/`[2]`) to drop snacks or wiggle free, **○ / △ / L1 / R1 / L2 / R2** (`buttons[1]`/`[3]`/`[4]`/`[5]`/`[6]`/`[7]`) to Belly-Dash, and **Options / Start** (`buttons[9]`) to Pause.
  - **Pause & Round Results:** **✕ / Options** to Resume or continue to Next Round / Play Again, **○** to return to the Lobby.
- **`P` / `Esc`:** Pause / Resume match
- **`F`:** Toggle Fullscreen (`⛶`)
- **`B`:** Toggle Cozy Café Background Music (`🎵`)
- **`M`:** Mute / Unmute all audio (`🔊`)

---

## 🛠️ Local Development

Pure vanilla HTML/CSS/ES Modules with zero build steps or external packages required.

```bash
python3 -m http.server 8123 --bind 127.0.0.1
```

Then open [http://127.0.0.1:8123/](http://127.0.0.1:8123/) in your browser.

---

## 🚀 Deployment

Configured to auto-deploy via GitHub Actions ([deploy-pages.yml](.github/workflows/deploy-pages.yml)) to **GitHub Pages** at `mochi.omiharjani.com` on every push to `main`.

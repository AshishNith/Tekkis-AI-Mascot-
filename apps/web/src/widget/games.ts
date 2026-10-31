// Little games to play with Tekkie, drawn inside the widget's panel.
import type { Emote } from "../mascot/TekkieCharacter";

export interface GameHost {
  /** Panel body to draw into. */
  el: HTMLElement;
  say(text: string): void;
  emote(kind: Emote): void;
  /** The player won something: Tekkie gets a little bond boost too. */
  reward(): void;
  /** "Catch me": Tekkie runs away from the pointer for `seconds`; resolves with the catches. */
  playCatch(seconds: number, onCatch: (count: number) => void): Promise<number>;
}

export const GAMES = [
  { id: "rps", name: "Rock paper scissors", icon: "✊" },
  { id: "ttt", name: "Tic-tac-toe", icon: "⭕" },
  { id: "catch", name: "Catch me!", icon: "🏃" },
  { id: "memory", name: "Memory match", icon: "🧠" },
  { id: "math", name: "Quick maths", icon: "➕" },
] as const;

export type GameId = (typeof GAMES)[number]["id"];

export function startGame(id: GameId, host: GameHost) {
  if (id === "rps") rockPaperScissors(host);
  else if (id === "ttt") ticTacToe(host);
  else if (id === "memory") memoryMatch(host);
  else if (id === "math") quickMaths(host);
  else catchMe(host);
}

function memoryMatch(host: GameHost) {
  const faces = ["🍪", "👟", "🎧", "🚀", "🎈", "🌟"];
  const cards = [...faces, ...faces].sort(() => Math.random() - 0.5);
  let open: number[] = [];
  let matched = 0;
  let moves = 0;
  let busy = false;
  host.el.innerHTML = `<p class="game-msg">Find the pairs!</p><div class="memory">${cards.map((_, i) => `<button type="button" class="mem-card" data-i="${i}" aria-label="Card ${i + 1}"></button>`).join("")}</div>`;
  const msg = host.el.querySelector(".game-msg")!;
  const btns = [...host.el.querySelectorAll<HTMLButtonElement>(".mem-card")];
  btns.forEach((b, i) =>
    b.addEventListener("click", () => {
      if (busy || open.includes(i) || b.classList.contains("done")) return;
      b.textContent = cards[i];
      b.classList.add("up");
      open.push(i);
      if (open.length < 2) return;
      moves++;
      const [a, c] = open;
      if (cards[a] === cards[c]) {
        btns[a].classList.add("done");
        btns[c].classList.add("done");
        matched++;
        open = [];
        if (matched === faces.length) {
          msg.textContent = `All pairs in ${moves} moves!`;
          host.emote("celebrate");
          host.reward();
          host.say(moves <= 9 ? "Wow, what a memory!" : "Nice one! Again?");
          setTimeout(() => memoryMatch(host), 3000);
        } else host.emote(Math.random() < 0.5 ? "nod" : "surprised");
      } else {
        busy = true;
        setTimeout(() => {
          for (const k of open) {
            btns[k].textContent = "";
            btns[k].classList.remove("up");
          }
          open = [];
          busy = false;
        }, 700);
      }
      msg.textContent = `${matched}/${faces.length} pairs · ${moves} moves`;
    }),
  );
}

function quickMaths(host: GameHost) {
  const total = 6;
  let n = 0;
  let right = 0;
  let answer = 0;
  let started = 0;
  host.el.innerHTML = `<p class="game-msg">Six sums, as fast as you can!</p><p class="game-q"></p><form class="game-form"><input type="text" inputmode="numeric" aria-label="Your answer" /><button type="submit">Go</button></form>`;
  const msg = host.el.querySelector(".game-msg")!;
  const q = host.el.querySelector(".game-q")!;
  const form = host.el.querySelector<HTMLFormElement>(".game-form")!;
  const input = form.querySelector("input")!;
  const ask = () => {
    const a = 2 + Math.floor(Math.random() * 12);
    const b = 2 + Math.floor(Math.random() * 12);
    const op = ["+", "−", "×"][Math.floor(Math.random() * 3)];
    answer = op === "+" ? a + b : op === "−" ? Math.abs(a - b) : a * b;
    q.textContent = `${Math.max(a, b)} ${op} ${Math.min(a, b)} = ?`;
    input.value = "";
    input.focus();
  };
  started = performance.now();
  ask();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (Number(input.value) === answer) {
      right++;
      host.emote("nod");
    } else {
      host.emote("shake");
      host.say(`It was ${answer}!`);
    }
    n++;
    if (n < total) {
      msg.textContent = `${right}/${n} right`;
      ask();
      return;
    }
    const secs = Math.round((performance.now() - started) / 100) / 10;
    msg.textContent = `${right}/${total} right in ${secs}s`;
    q.textContent = right === total ? "Perfect!" : right >= 4 ? "Nice!" : "Practice makes perfect.";
    form.remove();
    if (right >= 4) {
      host.emote("celebrate");
      host.reward();
    }
    const again = document.createElement("button");
    again.type = "button";
    again.className = "game-start";
    again.textContent = "Play again";
    again.addEventListener("click", () => quickMaths(host));
    host.el.appendChild(again);
  });
}

function rockPaperScissors(host: GameHost) {
  const moves = [
    { id: "rock", icon: "✊", beats: "scissors" },
    { id: "paper", icon: "✋", beats: "rock" },
    { id: "scissors", icon: "✌️", beats: "paper" },
  ];
  let you = 0;
  let me = 0;
  host.el.innerHTML = `<p class="game-score">You 0 · Tekkie 0</p><div class="game-row">${moves
    .map((m) => `<button type="button" class="game-btn" data-move="${m.id}" aria-label="${m.id}">${m.icon}</button>`)
    .join("")}</div><p class="game-msg">Pick one!</p>`;
  const score = host.el.querySelector(".game-score")!;
  const msg = host.el.querySelector(".game-msg")!;
  host.el.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const mine = moves[Math.floor(Math.random() * 3)];
      const yours = moves.find((m) => m.id === btn.dataset.move)!;
      let line: string;
      if (mine.id === yours.id) {
        line = `${yours.icon} vs ${mine.icon}: a draw!`;
        host.emote("surprised");
      } else if (yours.beats === mine.id) {
        you++;
        line = `${yours.icon} beats ${mine.icon}: you win!`;
        host.emote("sad");
        host.reward();
      } else {
        me++;
        line = `${mine.icon} beats ${yours.icon}: I win!`;
        host.emote("celebrate");
      }
      score.textContent = `You ${you} · Tekkie ${me}`;
      msg.textContent = line;
    }),
  );
}

function ticTacToe(host: GameHost) {
  const board: ("X" | "O" | "")[] = Array(9).fill("");
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  let over = false;
  host.el.innerHTML = `<div class="ttt">${board.map((_, i) => `<button type="button" class="ttt-cell" data-i="${i}" aria-label="Square ${i + 1}"></button>`).join("")}</div><p class="game-msg">You're ✕. Your move!</p>`;
  const cells = [...host.el.querySelectorAll<HTMLButtonElement>(".ttt-cell")];
  const msg = host.el.querySelector(".game-msg")!;
  const winner = () => {
    for (const [a, b, c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    return board.every(Boolean) ? "draw" : "";
  };
  const draw = () => cells.forEach((c, i) => (c.textContent = board[i] === "X" ? "✕" : board[i] === "O" ? "◯" : ""));
  const finish = (w: string) => {
    over = true;
    if (w === "X") {
      msg.textContent = "You win! Nice one.";
      host.emote("surprised");
      host.reward();
    } else if (w === "O") {
      msg.textContent = "I win! Rematch?";
      host.emote("celebrate");
    } else {
      msg.textContent = "A draw! We're both too good.";
      host.emote("laugh");
    }
    setTimeout(() => ticTacToe(host), 2500);
  };
  // Tekkie plays fair but not perfectly: win, block, centre, then any corner or side.
  const pick = () => {
    const free = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    for (const who of ["O", "X"] as const) {
      for (const i of free) {
        board[i] = who;
        const w = winner() === who;
        board[i] = "";
        if (w && (who === "O" || Math.random() < 0.85)) return i;
      }
    }
    if (board[4] === "") return 4;
    const corners = free.filter((i) => [0, 2, 6, 8].includes(i));
    const pool = corners.length ? corners : free;
    return pool[Math.floor(Math.random() * pool.length)];
  };
  cells.forEach((cell, i) =>
    cell.addEventListener("click", () => {
      if (over || board[i]) return;
      board[i] = "X";
      draw();
      const w = winner();
      if (w) return finish(w);
      msg.textContent = "Hmm, let me think…";
      setTimeout(() => {
        board[pick()] = "O";
        draw();
        const w2 = winner();
        if (w2) finish(w2);
        else msg.textContent = "Your move!";
      }, 450);
    }),
  );
}

function catchMe(host: GameHost) {
  host.el.innerHTML = `<p class="game-msg">I'll run away from your cursor for 20 seconds. Click me as many times as you can!</p><button type="button" class="game-start">Start</button>`;
  const msg = host.el.querySelector(".game-msg")!;
  host.el.querySelector(".game-start")!.addEventListener("click", async (e) => {
    (e.currentTarget as HTMLButtonElement).remove();
    msg.textContent = "Catch me! 0 so far";
    host.say("Bet you can't catch me!");
    const caught = await host.playCatch(20, (n) => (msg.textContent = `Catch me! ${n} so far`));
    msg.textContent = caught ? `Time's up! You caught me ${caught} time${caught === 1 ? "" : "s"}.` : "Time's up! Too fast for you!";
    if (caught >= 3) {
      host.emote("surprised");
      host.reward();
    } else host.emote("laugh");
    const again = document.createElement("button");
    again.type = "button";
    again.className = "game-start";
    again.textContent = "Play again";
    again.addEventListener("click", () => catchMe(host));
    host.el.appendChild(again);
  });
}

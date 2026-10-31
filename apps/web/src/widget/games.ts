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
] as const;

export type GameId = (typeof GAMES)[number]["id"];

export function startGame(id: GameId, host: GameHost) {
  if (id === "rps") rockPaperScissors(host);
  else if (id === "ttt") ticTacToe(host);
  else catchMe(host);
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

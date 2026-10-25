# DROP ZONE

DROP ZONE is a two-player Connect Four game for friends playing from separate devices. The host creates a room and shares a four-letter code or invite link. Both players see the same live board, and the server validates turns, gravity, wins, and draws.

## Run locally

Requirements: Node.js 18 or newer.

1. Copy `.env.example` to `.env` if you want a local environment file. No API key or account is needed.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` in two browser tabs or devices on the same network. For a phone on the same Wi-Fi, use the computer's LAN address instead of `localhost`.

## How to play

1. The host enters a name, creates a room, and sends the room code or invite link to one other player.
2. The second player enters their name and joins. The host starts once both seats are filled.
3. Players alternate turns. On your turn, tap an arrow above a column. Your piece occupies the lowest open space in that column.
4. The first player to connect four pieces horizontally, vertically, or diagonally wins. If all 42 spaces fill without a line of four, the game is a draw.
5. Choose **Play again** to reset the board with the same players.

The board and turn rules are enforced on the server. Refreshing a browser reconnects to its saved seat in that browser. If the host disconnects, the other connected player becomes host. Rooms expire after two idle hours. A room supports two player seats; additional players are told the room is full.

## Architecture and game state

```text
Phone / desktop browser A                 Phone / desktop browser B
   HTML + CSS + browser JS                   HTML + CSS + browser JS
              \                                  /
               \       Socket.IO events         /
                +----------- Express ------------+
                            |
                    Authoritative match
               lobby -> playing -> finished
                            |
                turn / gravity / win checks
```

- `server.js` serves the client, creates rooms, handles Socket.IO events, reconnects seats, rate-limits client events, and expires idle rooms.
- `match.js` owns the board model and authoritative game rules.
- `public/app.js` renders the UI and sends player actions; it never decides the winner.
- `public/styles.css` provides the responsive visual theme and reduced-motion support.

The only match states are `lobby`, `playing`, and `finished`. A valid start transitions `lobby -> playing`. A valid move either leaves the match in `playing` or transitions it to `finished` after a win or draw. A rematch resets the existing seats and returns to `lobby`.

## Manual check (three browser tabs)

1. In tab 1, create a room as `Host`. Copy the four-letter room code.
2. In tab 2, join with the code as `Guest`. Confirm both names and marks appear in both tabs.
3. In tab 3, try joining the same room. It should explain that the room already has two players.
4. Start from tab 1. Confirm only the player whose turn it is can use the column arrows.
5. Take turns to make a vertical or horizontal line of four. Confirm both tabs announce the same winner. Try **Play again**.
6. Refresh tab 2 during a match. Confirm it returns to the same seat and receives the current board.
7. Disconnect the host tab and confirm the connected player is promoted to host after the host is away.

## Deploy to Render

This repository includes `render.yaml` and a `Dockerfile`.

1. Push the `drop-zone` project to a GitHub repository.
2. In Render, create a Node web service with build command `npm install` and start command `npm start`. If `drop-zone` is the repository root, you can instead choose **New → Blueprint** and connect its `render.yaml`.
3. Wait for the service to deploy, then open the `onrender.com` URL Render provides. Share that URL with both players; the room code or invite link connects them to the same live server.
4. For production use, choose a persistent hosting plan and add a shared store if you need rooms to survive process restarts or scale across multiple server instances. This starter keeps rooms in memory, so a server restart clears active rooms. Render's free web services can spin down after inactivity; see [Render's free service details](https://render.com/docs/free).

If the project is inside a larger repository, set the service's **Root Directory** to `drop-zone` and enter the build and start commands above. Or publish the contents of this folder as the root of a dedicated repository so Render can use its included `render.yaml` Blueprint.

## Configuration

- `PORT` is supplied by Render and defaults to `3000` locally.
- `.env.example` documents the local environment file. This game does not need an API key.

## Safety and accessibility

Names are length-limited and escaped before rendering. Socket actions are rate-limited. The client uses large labeled controls, keyboard-visible focus, text status in addition to piece color, and reduced-motion support. Sounds are synthesized in the browser and can be muted.

## Docker

Build and run with `docker build -t drop-zone .` and `docker run --rm -p 3000:3000 drop-zone`.

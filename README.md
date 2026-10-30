# TCGLoader

Collaborative whiteboards. Sign up with a username and password, create boards, invite friends by username, and draw on the same board in real time.

**Stack:** Next.js 16 (App Router) · Liveblocks (real-time) · Neon Postgres + Prisma · Vercel Blob (images) · Tailwind CSS

## Features

- **Accounts:** sign up, log in and log out with a username and password (passwords are hashed with bcrypt; sessions are signed, httpOnly cookies).
- **Dashboard:** "My boards" and "Shared with me"; create, rename, delete or leave boards.
- **Sharing:** the owner invites people by username and can remove them. Everyone invited is an editor.
- **Real-time:** live cursors with usernames, avatars of who's online, and outlines around what others have selected.
- **Canvas:**
  - Infinite canvas with pan and zoom.
  - Select by clicking or dragging a box; move, resize, duplicate, bring to front or send to back.
  - Freehand pen, rectangle, ellipse, line, arrow and text boxes, with colors, fill, stroke width and font size.
  - Upload images by file picker, drag and drop, or paste.
  - **Cut a card sheet into cards:** upload an uncut sheet with the sheet button, or select any image and click **Cut into cards**. Set columns × rows (presets include 10 × 7 for Tabletop Simulator decks), plus an optional outer margin and gap between cards in pixels. Each card reuses the uploaded sheet with a crop, so cutting is instant and keeps full quality.
  - Delete, and per-user undo/redo.
- **Cards, hands and piles** (any image on the board is a card):
  - **Your hand:** a tray at the bottom of the screen that only you can see. Others see how many cards you hold on your avatar. Drag cards into it, or select cards and click **Add to hand**. Drag a card out onto the board to play it face up, Shift + drag to play it face down, or drop it on a pile. Hover a card in your hand to see a bigger preview.
  - **Player 1 / Player 2:** the switch on top of your hand turns the board 180° so you can sit on the other side of the table, with your side at the bottom. Cards, text, piles and counters stay upright; drawings and arrows turn with the board. Only your view changes, and this browser remembers your side for each board.
  - **Piles** (draw piles, discard piles): create one with the **New pile** button, or select cards and click **Make pile**. Drop cards onto a pile to put them on top. Drag the top card off to put it on the board (Shift + drag puts it face down). Drag the dark name tab to move the pile; double-click the tab to rename it.
  - **Pile actions** (select a pile): Draw, Draw several, Take top, Shuffle, Flip, Look through (only you see the cards; a large preview of one card, with a slider, a strip of small cards and the arrow keys to move through the pile), Rename, Duplicate (copies the cards too), Delete (deletes its cards too).
  - **Flipping:** press **F** while hovering a card or pile. All face-down cards share one card-back pattern.
  - Hand privacy is "honest": the app never shows other people's hands, but the data is sent to everyone on the board, so a technical user could read it in their browser's developer tools.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| V / H / P / T | Select / Pan / Pen / Text |
| R / O / L / A | Rectangle / Ellipse / Line / Arrow |
| Space + drag, middle mouse | Pan |
| Scroll / Ctrl + scroll | Pan / Zoom |
| Shift while drawing | Square shapes, 45° lines |
| Shift + click | Add to / remove from selection |
| Delete / Backspace | Delete selection |
| Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) | Undo / Redo |
| Ctrl+A / Ctrl+D | Select all / Duplicate |
| Double-click text | Edit text |
| F (while hovering) | Flip a card or pile |
| Shift + drag from hand or pile | Play the card face down |
| Esc | Deselect |

## Setup

### 1. Create the services

1. **Neon:** create a project at [neon.tech](https://neon.tech) and copy the **pooled** connection string.
2. **Liveblocks:** create a project at [liveblocks.io](https://liveblocks.io) and copy its **secret key** (`sk_...`).
3. **Vercel Blob:** in your Vercel project, open **Storage → Create → Blob**, choose **public** access, and copy `BLOB_READ_WRITE_TOKEN`.

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in the 4 values in `.env`. For `SESSION_SECRET`, use a long random string (`openssl rand -base64 32`).

### 3. Install and create the database tables

```bash
npm install        # also generates the Prisma client
npm run db:push    # creates the tables in Neon
npm run dev
```

Open http://localhost:3000.

> Image uploads need `BLOB_READ_WRITE_TOKEN` to be set locally too.

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add the same 4 environment variables in **Project → Settings → Environment Variables**. Connecting the Blob store to the project adds `BLOB_READ_WRITE_TOKEN` automatically.
3. Deploy. `npm install` runs `prisma generate` during the build. Run `npm run db:push` from your machine whenever `prisma/schema.prisma` changes.

## Project layout

```
prisma/schema.prisma          User, Board, BoardMember tables
src/proxy.ts                  Redirects signed-out users away from protected pages
src/liveblocks.config.ts      Types for Liveblocks presence and storage
src/lib/                      Database client, sessions, board access checks
src/app/actions/              Server actions (auth, boards, sharing)
src/app/api/liveblocks-auth/  Lets a user into a board's Liveblocks room only if they have access
src/app/api/upload/           Issues Vercel Blob upload tokens for board members
src/app/dashboard/            Board list
src/app/board/[id]/           Board page
src/components/board/         Canvas, layers, toolbar, share dialog
```

### How board data is stored

- **Postgres** stores users, boards and who has access.
- **Liveblocks** stores each board's contents in a room called `board:<id>`. `layers` maps layer ids to shapes, and `layerIds` holds the paint order.
- **Vercel Blob** stores uploaded images. Layers keep only the image URL.

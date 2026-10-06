# Phase 2b-1 — AI Foundation + Mock Interviewer — Design Spec

**Date:** 2026-10-01 · **Status:** Approved in chat · **Provider:** Google Gemini (user's key)

**Phase 2b split:**
- 2b-1 (this spec): AI groundwork and the mock interviewer.
- 2b-2: fit score and interview prep notes.
- 2b-3: resume tailoring, cover letters and email drafts.

## 1. Settings and the Gemini client

**New settings:**
- `geminiKey`, stored in settings.json (0600) like the other keys.
- `geminiLiveModel`, default `gemini-3.8-live`. **Every Gemini call uses this Live model** (the interviewer, voice previews, coaching tips and scorecards); there is no separate text model. The Live model can only reply with audio, so structured results (tips, scorecards) come back as the arguments of a tool call (`submit_result`), not as spoken JSON. Tested: a full scorecard arrives in ~4 s via the tool call, while speaking it took ~55 s and was cut off. (A separate text model was tried first and dropped: its free-tier quota ran out and blocked scoring.)
- The Settings UI shows the privacy note: on the free tier, Google may use submitted content to improve its products.

**`gemini.go`** (REST, `x-goog-api-key` header; the key never appears in URLs or errors):

`generateJSON(ctx, model, system, parts, schema, out)`:
- Calls `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
- Sends `generationConfig.responseMimeType = "application/json"` and `responseSchema` (OpenAPI-style types: OBJECT, STRING, INTEGER, ARRAY).
- Parses `candidates[0].content.parts[*].text` as JSON into `out`.
- Parts can be text or `inlineData` (for PDFs).

`createLiveToken(ctx, setup, minutes)`:
- Calls `POST https://generativelanguage.googleapis.com/v1beta/auth_tokens` with the body:
  - `uses: 0` (unlimited, so reconnects work).
  - `expireTime` and `newSessionExpireTime`, both `now + minutes + 30m`.
  - `bidiGenerateContentSetup: setup`.
  - `fieldMask` listing the locked fields: `model,generationConfig,systemInstruction,inputAudioTranscription,outputAudioTranscription,contextWindowCompression,realtimeInputConfig`.
- Session resumption is left unlocked so the client can pass a handle.
- Returns the response's `name` (the token).

**Live endpoint** (a constant):
`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=…`

**Errors:** HTTP status plus a short body, never the key. 503 (high demand) and 429 (rate limit) are retried twice, after 2 s and 5 s. A missing key gives "Add your Gemini API key in Settings".

## 2. Resume (migration 6: `profile`)

`profile`: a single row with `resume_file_name`, `resume_path`, `resume_text`, `updated_at`.

- **Upload** (native file dialog: pdf/docx/txt/md) copies the file to `<dataDir>/resume/`.
- **Text extraction:**
  - TXT/MD: read as-is.
  - DOCX: unzip `word/document.xml`; `<w:p>` becomes a newline, `<w:t>` is text.
  - PDF: extracted **locally** (pure-Go `ledongthuc/pdf`): glyphs grouped into lines by baseline. Nothing is uploaded at this point. A PDF with no text layer (a scan) gives an error asking the user to paste the text instead.
- **Review:** the user can view and edit `resume_text` in Settings (Save). Every AI feature uses `resume_text`.

## 3. Mock interview data (migration 6: `mock_interviews`)

| Group | Columns |
|---|---|
| Identity | `id`, `job_id` (FK cascade) |
| Setup | `kind` (`phone_screen` / `behavioral` / `technical` / `hiring_manager` / `final_round`), `minutes` (10 / 25 / 45), `persona` (`friendly` / `neutral` / `tough`), `voice`, `focus` |
| Lifecycle | `status` (`live` / `scoring` / `done` / `failed`), `started_at`, `ended_at` |
| Results | `transcript` (JSON `[{speaker:"interviewer"|"you", text, atMs}]`), `scorecard` (JSON), `recording_path`, `error` |

**Voices:** all 30 prebuilt Gemini voices, each shown with its style. **Previews** come from the **Live model** (the same one that runs the interview): the backend opens a short Live session (API key stays in Go), has it say a greeting line, and caches the WAV in `<dataDir>/voice-previews/<Voice>-live.wav`.

## 4. Interview flow

**Starting:**
- **Entry points:** a "Mock interview" button on the job page, and in the job's right-click menu.
- **`PrepareInterview(jobId, setup)`** builds the brief from the job (company, position, description, notes, contacts' roles), the resume text and the setup. It inserts the `mock_interviews` row (`live`), creates the token, and returns `{sessionId, token, wsUrl, setup}`.
- **The brief** (system instruction) tells the interviewer to:
  - Play a {persona} interviewer at {company} for {position}, running a {kind} interview of {minutes} minutes.
  - Greet briefly, then ask one question at a time with realistic follow-ups.
  - Use the resume to ask about real experience.
  - Respect the focus.
  - Never coach or give feedback during the interview.
  - Track time and wrap up near the end, inviting the candidate's questions.
  - Stay in character.
- **The setup message:**
  - `model: models/{liveModel}`.
  - `generationConfig: {responseModalities: ["AUDIO"], speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName}}}}`.
  - `systemInstruction: {parts: [{text}]}`.
  - `inputAudioTranscription: {}` and `outputAudioTranscription: {}`.
  - `contextWindowCompression: {slidingWindow: {}}`.
  - `sessionResumption: {}`.

**Client (`frontend/src/lib/live/`):**
- **Opening the session:**
  - Opens the WebSocket and sends `{setup}`, adding `sessionResumption.handle` when resuming.
  - After `setupComplete` (first connect only), sends `clientContent {turns: [{role: "user", parts: [{text: "(The candidate has joined. Begin.)"}]}], turnComplete: true}`.
- **Microphone:**
  - `getUserMedia` with echo cancellation, noise suppression and mono.
  - An AudioWorklet feeds Float32 frames to the main thread, which downsamples to 16 kHz PCM16.
  - About every 100 ms it sends `{realtimeInput: {audio: {data: base64, mimeType: "audio/pcm;rate=16000"}}}`.
  - Mute pauses sending.
- **Playback:**
  - `serverContent.modelTurn.parts[].inlineData` (PCM16 at 24 kHz) is scheduled back to back in one AudioContext.
  - `interrupted` stops every queued source.
- **Transcript:**
  - `inputTranscription` and `outputTranscription` text is appended to the current "you" or "interviewer" line, with `atMs` relative to the recording start.
  - The speaker switches when the other side's transcription arrives.
- **Resumption:** the client stores `sessionResumptionUpdate.newHandle` when it's resumable. On `goAway` or an unexpected close, it reconnects with the handle (up to 3 tries) and the UI shows "Reconnecting…".
- **Recording:** a MediaStreamDestination mixes the mic and the playback, and a MediaRecorder captures it as webm/opus. On end, the blob goes to Go as base64 via `SaveInterviewRecording`.
- **Crash safety:** `SaveInterviewTranscript` runs every 30 s and at the end.

**Coaching cues** (a toggle hides them):
- **Local meters for the current answer:**
  - WPM = words / speaking minutes (first to last input transcription in the answer).
  - Fillers: um, uh, erm, like, you know, basically, actually, sort of, kind of, I mean.
  - An answer timer that turns amber at 150 s.
- **AI nudge:**
  - Sent when an answer of 8+ words ends (the interviewer starts the next turn).
  - Calls `NudgeAnswer(sessionId, question, answer)`, which asks the Live model for `{nudge: string, kind: "tip"|"good"}` through the tool call, at most about 12 words.
  - Shown for that answer; errors are silent (cues are optional).

**Ending:**
- **The End button,** or the interviewer's wrap-up followed by the user ending, stops the audio, uploads the recording, saves the transcript, then calls `ScoreInterview(sessionId)`:
  - Status `scoring`.
  - The Live model receives the transcript, job and resume and returns, through the tool call, the schema `{overall: {communication, structure, relevance, depth, confidence: 1-5}, summary, questions: [{question, answerSummary, worked, improve, strongerAnswer}], practiceNext: [3 strings]}`.
  - Status `done`, or `failed` with the error.
- **Retry:** `ScoreInterview` can be retried from the review page.
- **Connection lost:** if the connection can't be resumed, the session ends and whatever transcript exists is still scored.

**Review:**
- **Mock interviews panel** on the job page: date, kind, overall average, and a link to review.
- **`/interviews/:id`:**
  - The scorecard (bars per dimension, summary, practice-next list, per-question cards).
  - The transcript (click a line to seek).
  - An `<audio>` player playing the recording through `GetInterviewRecording` (a data URL).
  - Retry scoring, Delete.

## 5. Errors

- **No Gemini key:** the "Mock interview" button opens a dialog linking to Settings.
- **No resume:** allowed, with a warning that the interview will be generic.
- **Microphone denied or not found:** a message with the Windows hint (*Settings → Privacy → Microphone → Let desktop apps access your microphone*).
- **WebSocket setup error** (close code or reason): shown as is, and the session is marked `failed`.

## 6. Testing

- **Go** (fake HTTP servers):
  - `generateJSON`: request body (schema, mime type, header key) and response parsing.
  - The key never appears in errors.
  - `createLiveToken`: body fields, fieldMask and expire times.
  - DOCX extraction.
  - The brief contains the job, resume, kind, minutes, persona and focus.
  - `PrepareInterview` stores the row.
  - The scorecard schema round trip, with failure → `failed`.
  - Transcript and recording storage; deleting removes the file.
  - Migration 6.
- **TypeScript (Vitest):**
  - Downsampling 48 kHz → 16 kHz length and values.
  - Float32 ↔ PCM16 and base64 round trip.
  - The filler and WPM meters.
  - The live message reducer: recorded server messages → transcript lines, speaker switching, interrupted, resumption handle, goAway.
- **Manual:** a real session by the user (the microphone, voice and resumption can't be automated here).

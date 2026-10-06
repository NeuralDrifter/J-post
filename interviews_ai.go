package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"
)

// Mock interviews: a live Gemini voice session plays the interviewer; a text
// model gives per-answer nudges and the final scorecard.

type InterviewSetup struct {
	Kind            string `json:"kind"`
	Minutes         int    `json:"minutes"`
	Persona         string `json:"persona"`
	Voice           string `json:"voice"`           // "" = surprise me (random)
	InterviewerName string `json:"interviewerName"` // "" = random name matching the voice
	Focus           string `json:"focus"`
}

// Transcript speakers.
const (
	SpeakerInterviewer = "interviewer"
	SpeakerCandidate   = "you"
)

type TranscriptLine struct {
	Speaker string `json:"speaker"` // a Speaker* constant
	Text    string `json:"text"`
	AtMs    int64  `json:"atMs"`
}

type ScoreSet struct {
	Communication int `json:"communication"`
	Structure     int `json:"structure"`
	Relevance     int `json:"relevance"`
	Depth         int `json:"depth"`
	Confidence    int `json:"confidence"`
}

type QuestionReview struct {
	Question       string `json:"question"`
	AnswerSummary  string `json:"answerSummary"`
	Worked         string `json:"worked"`
	Improve        string `json:"improve"`
	StrongerAnswer string `json:"strongerAnswer"`
}

type Scorecard struct {
	Overall      ScoreSet         `json:"overall"`
	Summary      string           `json:"summary"`
	Questions    []QuestionReview `json:"questions"`
	PracticeNext []string         `json:"practiceNext"`
}

// Mock interview statuses: live → scoring → done, or failed (kept so scoring can be retried).
const (
	MockLive    = "live"
	MockScoring = "scoring"
	MockDone    = "done"
	MockFailed  = "failed"
)

type MockInterview struct {
	ID              string           `json:"id"`
	JobID           string           `json:"jobId"`
	Company         string           `json:"company"`
	Position        string           `json:"position"`
	Kind            string           `json:"kind"`
	Minutes         int              `json:"minutes"`
	Persona         string           `json:"persona"`
	Voice           string           `json:"voice"`
	InterviewerName string           `json:"interviewerName"`
	Focus           string           `json:"focus"`
	Status          string           `json:"status"` // a Mock* constant
	StartedAt       string           `json:"startedAt"`
	EndedAt         string           `json:"endedAt"`
	Transcript      []TranscriptLine `json:"transcript"`
	Scorecard       *Scorecard       `json:"scorecard,omitempty"`
	HasRecording    bool             `json:"hasRecording"`
	Error           string           `json:"error"`
}

// LiveSession is what the page needs to open the voice connection.
type LiveSession struct {
	SessionID       string         `json:"sessionId"`
	Token           string         `json:"token"`
	WSURL           string         `json:"wsUrl"`
	Setup           map[string]any `json:"setup"`
	Minutes         int            `json:"minutes"`
	Kind            string         `json:"kind"`
	Company         string         `json:"company"`
	Position        string         `json:"position"`
	Voice           string         `json:"voice"`
	InterviewerName string         `json:"interviewerName"`
	Cues            LiveCues       `json:"cues"`
}

type Nudge struct {
	Nudge string `json:"nudge"`
	Kind  string `json:"kind"` // tip | good
}

func validateInterviewSetup(s *InterviewSetup) error {
	if _, ok := findInterviewKind(s.Kind); !ok {
		return fmt.Errorf("unknown interview type %q", s.Kind)
	}
	if !slices.Contains(interviewOptions.Minutes, s.Minutes) {
		return fmt.Errorf("length must be %s minutes", minutesChoices())
	}
	if _, ok := findInterviewPersona(s.Persona); !ok {
		return fmt.Errorf("unknown interviewer style %q", s.Persona)
	}
	if s.Voice == "" || s.Voice == "random" {
		s.Voice = pick(interviewVoiceList).Name // a stranger's voice, like a real interview
	}
	if !interviewVoices[s.Voice] {
		return fmt.Errorf("unknown voice %q", s.Voice)
	}
	s.InterviewerName = strings.Join(strings.Fields(s.InterviewerName), " ")
	if s.InterviewerName == "" {
		s.InterviewerName = randomInterviewerName(s.Voice)
	}
	s.Focus = strings.TrimSpace(s.Focus)
	return nil
}

// buildInterviewBrief is the interviewer's system instruction. s must already be validated.
func buildInterviewBrief(job Job, contacts []Contact, resume string, s InterviewSetup) string {
	kind, _ := findInterviewKind(s.Kind)
	persona, _ := findInterviewPersona(s.Persona)
	var b strings.Builder
	fmt.Fprintf(&b, "You are %s, %s at %s, conducting a %s interview for the %s role. ", s.InterviewerName, kind.interviewer, job.Company, kind.briefName, job.Position)
	fmt.Fprintf(&b, "The interview lasts %d minutes. Be a %s interviewer: %s.\n\n", s.Minutes, s.Persona, persona.briefStyle)
	b.WriteString(`How to run it:
- Greet the candidate briefly and introduce yourself by name and role.
- Ask one question at a time, then listen. Ask realistic follow-ups based on what they actually said.
- Ground questions in the job description and in the candidate's real experience from their resume.
- Never coach, grade or give feedback during the interview. Stay in character the whole time.
- You'll receive silent timekeeper notes in [square brackets]. Never mention or read them out; when told time is nearly up, wrap up and invite the candidate's questions, then answer them in character. When told time is up, thank the candidate and close the interview.
- If the candidate stops mid-sentence or trails off, they're probably pausing to think. Don't move on: wait, or briefly invite them to continue ("Take your time" / "Go on").
- Speak naturally and concisely, like a real person on a call.
`)
	if s.Focus != "" {
		fmt.Fprintf(&b, "- The candidate asked to practice: %s. Make sure this comes up.\n", s.Focus)
	}
	fmt.Fprintf(&b, "\nJob description:\n%s\n", orDefault(job.Description, "(not provided)"))
	if strings.TrimSpace(job.Notes) != "" {
		fmt.Fprintf(&b, "\nThe candidate's own notes about this job (context only):\n%s\n", job.Notes)
	}
	if len(contacts) > 0 {
		b.WriteString("\nPeople the candidate has been in touch with at the company (background only; you are not one of them):\n")
		for _, c := range contacts {
			fmt.Fprintf(&b, "- %s, %s\n", c.Name, orDefault(c.Role, "role unknown"))
		}
	}
	if strings.TrimSpace(resume) == "" {
		b.WriteString("\nNo resume was provided; ask about their background in general terms.\n")
	} else {
		fmt.Fprintf(&b, "\nThe candidate's resume:\n%s\n", resume)
	}
	return b.String()
}

// liveVoiceSetup is the part of a Live API setup message every session shares:
// the model, an audio-only reply in the given voice, and the system instruction.
func liveVoiceSetup(model, voice, instruction string) map[string]any {
	return map[string]any{
		"model": "models/" + model,
		"generationConfig": map[string]any{
			"responseModalities": []string{"AUDIO"},
			"speechConfig":       map[string]any{"voiceConfig": map[string]any{"prebuiltVoiceConfig": map[string]any{"voiceName": voice}}},
		},
		"systemInstruction": map[string]any{"parts": []map[string]any{{"text": instruction}}},
	}
}

// thinkingPauseMs is how long the candidate can go quiet before the Live API
// decides their turn is over. Its default is tuned for quick chat; interview
// answers have breaths and thinking pauses mid-sentence.
const thinkingPauseMs = 1500

// liveSetup is the interview's setup message (also locked into the session token):
// the voice setup plus patient turn detection, transcripts, long-session
// compression and resumption.
func liveSetup(model, voice, brief string) map[string]any {
	setup := liveVoiceSetup(model, voice, brief)
	// Only end-of-speech is relaxed; start-of-speech stays default so the
	// candidate can still interrupt the interviewer.
	setup["realtimeInputConfig"] = map[string]any{
		"automaticActivityDetection": map[string]any{
			"endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
			"silenceDurationMs":      thinkingPauseMs,
		},
	}
	setup["inputAudioTranscription"] = map[string]any{}
	setup["outputAudioTranscription"] = map[string]any{}
	setup["contextWindowCompression"] = map[string]any{"slidingWindow": map[string]any{}}
	setup["sessionResumption"] = map[string]any{}
	return setup
}

// LiveCues are the notes the page sends the interviewer during a session. The
// model has no clock, so the page "whispers" the time; the brief above tells the
// model to treat [bracketed] notes as silent, so both halves of that protocol live here.
type LiveCues struct {
	Start      string `json:"start"` // sent once, when the first connection is ready
	WrapUp     string `json:"wrapUp"`
	WrapUpAtMs int64  `json:"wrapUpAtMs"` // since the session started
	TimeUp     string `json:"timeUp"`
	TimeUpAtMs int64  `json:"timeUpAtMs"`
}

func liveCues(minutes int) LiveCues {
	warnMinutes := 4
	if minutes <= 10 {
		warnMinutes = 2
	}
	const msPerMinute = 60_000
	return LiveCues{
		Start:      "(The candidate has joined the call. Begin the interview.)",
		WrapUp:     fmt.Sprintf("[Timekeeper: about %d minutes remain. Start wrapping up after the current answer.]", warnMinutes),
		WrapUpAtMs: int64(minutes-warnMinutes) * msPerMinute,
		TimeUp:     "[Timekeeper: time is up. Thank the candidate and close the interview now.]",
		TimeUpAtMs: int64(minutes) * msPerMinute,
	}
}

// ---- storage ----

const mockColumns = `m.id, m.job_id, j.company, j.position, m.kind, m.minutes, m.persona, m.voice, m.interviewer_name, m.focus, m.status,
	m.started_at, m.ended_at, m.transcript, m.scorecard, m.recording_path, m.error`

func scanMock(s rowScanner) (MockInterview, error) {
	var m MockInterview
	var transcript, scorecard, recording string
	err := s.Scan(&m.ID, &m.JobID, &m.Company, &m.Position, &m.Kind, &m.Minutes, &m.Persona, &m.Voice, &m.InterviewerName, &m.Focus, &m.Status,
		&m.StartedAt, &m.EndedAt, &transcript, &scorecard, &recording, &m.Error)
	if err != nil {
		return m, err
	}
	m.Transcript = []TranscriptLine{}
	if err := json.Unmarshal([]byte(transcript), &m.Transcript); err != nil {
		return m, fmt.Errorf("mock interview %s: unreadable transcript: %w", m.ID, err)
	}
	if scorecard != "" {
		var sc Scorecard
		if err := json.Unmarshal([]byte(scorecard), &sc); err != nil {
			return m, fmt.Errorf("mock interview %s: unreadable scorecard: %w", m.ID, err)
		}
		m.Scorecard = &sc
	}
	m.HasRecording = recording != ""
	return m, nil
}

func (r *Repo) CreateMockInterview(jobID string, s InterviewSetup) (MockInterview, error) {
	if err := validateInterviewSetup(&s); err != nil {
		return MockInterview{}, err
	}
	if _, err := r.GetJob(jobID); err != nil {
		return MockInterview{}, err
	}
	id := newID()
	_, err := r.db.Exec(`INSERT INTO mock_interviews (id, job_id, kind, minutes, persona, voice, interviewer_name, focus, status, started_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, jobID, s.Kind, s.Minutes, s.Persona, s.Voice, s.InterviewerName, s.Focus, MockLive, ts(r.now()))
	if err != nil {
		return MockInterview{}, err
	}
	return r.GetMockInterview(id)
}

func (r *Repo) GetMockInterview(id string) (MockInterview, error) {
	m, err := scanMock(r.db.QueryRow(`SELECT `+mockColumns+` FROM mock_interviews m JOIN jobs j ON j.id = m.job_id WHERE m.id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return m, fmt.Errorf("mock interview %s: %w", id, ErrNotFound)
	}
	return m, err
}

func (r *Repo) ListMockInterviews(jobID string) ([]MockInterview, error) {
	return queryAll(r.db, scanMock, `SELECT `+mockColumns+` FROM mock_interviews m JOIN jobs j ON j.id = m.job_id
		WHERE m.job_id = ? ORDER BY m.started_at DESC`, jobID)
}

// recordingPath is "" when the session has no recording.
func (r *Repo) recordingPath(id string) (string, error) {
	var p string
	err := r.db.QueryRow(`SELECT recording_path FROM mock_interviews WHERE id = ?`, id).Scan(&p)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("mock interview %s: %w", id, ErrNotFound)
	}
	return p, err
}

func (r *Repo) SaveInterviewTranscript(id string, lines []TranscriptLine) error {
	if lines == nil {
		lines = []TranscriptLine{}
	}
	raw, err := json.Marshal(lines)
	if err != nil {
		return err
	}
	res, err := r.db.Exec(`UPDATE mock_interviews SET transcript = ? WHERE id = ?`, string(raw), id)
	return expectOneRow(res, err, "mock interview", id)
}

func (r *Repo) SetInterviewRecording(id, path string) error {
	res, err := r.db.Exec(`UPDATE mock_interviews SET recording_path = ? WHERE id = ?`, path, id)
	return expectOneRow(res, err, "mock interview", id)
}

// endedAtOnce records when the session ended the first time its status moves
// on from live; retries and re-scoring keep that original time.
const endedAtOnce = `ended_at = CASE WHEN ended_at = '' THEN ? ELSE ended_at END`

func (r *Repo) markScoring(id string) error {
	_, err := r.db.Exec(`UPDATE mock_interviews SET status = ?, error = '', `+endedAtOnce+` WHERE id = ?`,
		MockScoring, ts(r.now()), id)
	return err
}

func (r *Repo) markDone(id string, card Scorecard) error {
	raw, err := json.Marshal(card)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(`UPDATE mock_interviews SET status = ?, scorecard = ?, error = '', `+endedAtOnce+` WHERE id = ?`,
		MockDone, string(raw), ts(r.now()), id)
	return err
}

// markFailed keeps any earlier scorecard, so a failed re-score loses nothing.
func (r *Repo) markFailed(id string, cause error) error {
	_, err := r.db.Exec(`UPDATE mock_interviews SET status = ?, error = ?, `+endedAtOnce+` WHERE id = ?`,
		MockFailed, cause.Error(), ts(r.now()), id)
	return err
}

func (r *Repo) DeleteMockInterview(id string) error {
	path, err := r.recordingPath(id)
	if err != nil {
		return err
	}
	res, err := r.db.Exec(`DELETE FROM mock_interviews WHERE id = ?`, id)
	if err := expectOneRow(res, err, "mock interview", id); err != nil {
		return err
	}
	if path != "" {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

// ---- AI calls ----

func prepareInterview(ctx context.Context, r *Repo, s Settings, jobID string, setup InterviewSetup) (LiveSession, error) {
	if s.GeminiKey == "" {
		return LiveSession{}, errNoGeminiKey
	}
	if err := validateInterviewSetup(&setup); err != nil {
		return LiveSession{}, err
	}
	job, err := r.GetJob(jobID)
	if err != nil {
		return LiveSession{}, err
	}
	contacts, err := r.ListContacts(jobID)
	if err != nil {
		return LiveSession{}, err
	}
	profile, err := r.GetProfile()
	if err != nil {
		return LiveSession{}, err
	}
	setupMsg := liveSetup(s.GeminiLiveModel, setup.Voice, buildInterviewBrief(job, contacts, profile.ResumeText, setup))
	mi, err := r.CreateMockInterview(jobID, setup)
	if err != nil {
		return LiveSession{}, err
	}
	token, err := createLiveToken(ctx, s.GeminiKey, setupMsg, setup.Minutes, r.now())
	if err != nil {
		if markErr := r.markFailed(mi.ID, err); markErr != nil {
			return LiveSession{}, errors.Join(err, markErr)
		}
		return LiveSession{}, err
	}
	return LiveSession{SessionID: mi.ID, Token: token, WSURL: geminiLiveURL, Setup: setupMsg, Minutes: setup.Minutes,
		Kind: setup.Kind, Company: job.Company, Position: job.Position, Voice: setup.Voice, InterviewerName: setup.InterviewerName,
		Cues: liveCues(setup.Minutes)}, nil
}

var nudgeSchema = map[string]any{
	"type": "OBJECT",
	"properties": map[string]any{
		"nudge": map[string]any{"type": "STRING"},
		"kind":  map[string]any{"type": "STRING", "enum": []string{"tip", "good"}},
	},
	"required": []string{"nudge", "kind"},
}

const nudgeInstruction = "You are a discreet interview coach. Give ONE short cue (max 12 words) about the candidate's last answer: " +
	"either the single most useful improvement (kind: tip) or brief praise if it was strong (kind: good). No preamble."

func nudgeAnswer(ctx context.Context, s Settings, question, answer string) (Nudge, error) {
	var n Nudge
	err := generateJSON(ctx, s.GeminiKey, jsonPrompt{
		model:  s.GeminiTextModel,
		system: nudgeInstruction,
		parts:  []geminiPart{{Text: "Interviewer asked: " + question + "\nCandidate answered: " + answer}},
		schema: nudgeSchema,
	}, &n)
	return n, err
}

var scorecardSchema = func() map[string]any {
	str := map[string]any{"type": "STRING"}
	score := map[string]any{"type": "INTEGER"}
	return map[string]any{
		"type": "OBJECT",
		"properties": map[string]any{
			"overall": map[string]any{
				"type": "OBJECT",
				"properties": map[string]any{
					"communication": score, "structure": score, "relevance": score, "depth": score, "confidence": score,
				},
				"required": []string{"communication", "structure", "relevance", "depth", "confidence"},
			},
			"summary": str,
			"questions": map[string]any{"type": "ARRAY", "items": map[string]any{
				"type":       "OBJECT",
				"properties": map[string]any{"question": str, "answerSummary": str, "worked": str, "improve": str, "strongerAnswer": str},
				"required":   []string{"question", "answerSummary", "worked", "improve", "strongerAnswer"},
			}},
			"practiceNext": map[string]any{"type": "ARRAY", "items": str},
		},
		"required": []string{"overall", "summary", "questions", "practiceNext"},
	}
}()

// kindBriefName falls back to the raw id for sessions saved under a retired kind.
func kindBriefName(id string) string {
	if k, ok := findInterviewKind(id); ok {
		return k.briefName
	}
	return id
}

const scoringInstruction = "You are an expert interview coach reviewing a mock interview. Score each dimension 1-5 (5 = excellent): " +
	"communication (clarity, concision), structure (STAR or similar), relevance (answers the question, fits the role), " +
	"depth (specifics, metrics, ownership), confidence (decisive, composed). For every interviewer question give a short " +
	"answer summary, what worked, what to improve and a stronger example answer written in the candidate's voice using " +
	"only facts from their answers and resume. End with exactly three things to practice next. Be candid and specific. " +
	"The transcript comes from automatic voice detection: an answer may be split into fragments, cut off at a pause, or " +
	"overlap the interviewer's next line. Treat those as artifacts of the call, not as the candidate talking over the " +
	"interviewer or speaking in fragments, and judge the content of what they said."

func clampScore(v int) int { return clamp(v, 1, 5) }

// scoreInterview turns the transcript into a scorecard. Failures are recorded on
// the session (status "failed") so the transcript is kept and scoring can be retried.
func scoreInterview(ctx context.Context, r *Repo, s Settings, id string) (MockInterview, error) {
	mi, err := r.GetMockInterview(id)
	if err != nil {
		return mi, err
	}
	if len(mi.Transcript) == 0 {
		return r.failScoring(mi, errors.New("nothing was said, so there's nothing to score"))
	}
	if err := r.markScoring(id); err != nil {
		return mi, err
	}
	card, err := requestScorecard(ctx, r, s, mi)
	if err != nil {
		return r.failScoring(mi, err)
	}
	if err := r.markDone(id, card); err != nil {
		return mi, err
	}
	return r.GetMockInterview(id)
}

// failScoring records why scoring failed and returns the updated session with the cause.
func (r *Repo) failScoring(mi MockInterview, cause error) (MockInterview, error) {
	if err := r.markFailed(mi.ID, cause); err != nil {
		return mi, errors.Join(cause, err)
	}
	updated, err := r.GetMockInterview(mi.ID)
	if err != nil {
		return mi, errors.Join(cause, err)
	}
	return updated, cause
}

// requestScorecard asks the text model to review the session against the job and resume.
func requestScorecard(ctx context.Context, r *Repo, s Settings, mi MockInterview) (Scorecard, error) {
	var card Scorecard
	job, err := r.GetJob(mi.JobID)
	if err != nil {
		return card, err
	}
	profile, err := r.GetProfile()
	if err != nil {
		return card, err
	}
	err = generateJSON(ctx, s.GeminiKey, jsonPrompt{
		model:  s.GeminiTextModel,
		system: scoringInstruction,
		parts:  []geminiPart{{Text: scoringPrompt(job, mi, profile.ResumeText)}},
		schema: scorecardSchema,
	}, &card)
	if err != nil {
		return card, err
	}
	card.normalize()
	return card, nil
}

func scoringPrompt(job Job, mi MockInterview, resume string) string {
	return fmt.Sprintf("Role: %s at %s (%s interview, %s interviewer).\n\nJob description:\n%s\n\nCandidate's resume:\n%s\n\nTranscript:\n%s",
		job.Position, job.Company, kindBriefName(mi.Kind), mi.Persona, orDefault(job.Description, "(not provided)"),
		orDefault(resume, "(not provided)"), transcriptText(mi.Transcript))
}

// transcriptText renders the transcript as "Interviewer: …" / "Candidate: …"
// lines, joining consecutive lines from the same speaker (an answer split by a
// pause is still one answer).
func transcriptText(lines []TranscriptLine) string {
	var b strings.Builder
	for i, l := range lines {
		if i > 0 && lines[i-1].Speaker == l.Speaker {
			fmt.Fprintf(&b, " %s", l.Text)
			continue
		}
		if i > 0 {
			b.WriteString("\n")
		}
		who := "Interviewer"
		if l.Speaker == SpeakerCandidate {
			who = "Candidate"
		}
		fmt.Fprintf(&b, "%s: %s", who, l.Text)
	}
	if len(lines) > 0 {
		b.WriteString("\n")
	}
	return b.String()
}

// normalize keeps model output inside the scorecard's contract: scores 1-5 and
// a non-nil question list.
func (c *Scorecard) normalize() {
	o := &c.Overall
	for _, score := range []*int{&o.Communication, &o.Structure, &o.Relevance, &o.Depth, &o.Confidence} {
		*score = clampScore(*score)
	}
	if c.Questions == nil {
		c.Questions = []QuestionReview{}
	}
}

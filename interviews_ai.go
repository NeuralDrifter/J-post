package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

// Mock interviews: a live Gemini voice session plays the interviewer; a text
// model gives per-answer nudges and the final scorecard.

type InterviewSetup struct {
	Kind    string `json:"kind"`
	Minutes int    `json:"minutes"`
	Persona string `json:"persona"`
	Voice   string `json:"voice"`
	Focus   string `json:"focus"`
}

type TranscriptLine struct {
	Speaker string `json:"speaker"` // interviewer | you
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

type MockInterview struct {
	ID           string           `json:"id"`
	JobID        string           `json:"jobId"`
	Company      string           `json:"company"`
	Position     string           `json:"position"`
	Kind         string           `json:"kind"`
	Minutes      int              `json:"minutes"`
	Persona      string           `json:"persona"`
	Voice        string           `json:"voice"`
	Focus        string           `json:"focus"`
	Status       string           `json:"status"` // live, scoring, done, failed
	StartedAt    string           `json:"startedAt"`
	EndedAt      string           `json:"endedAt"`
	Transcript   []TranscriptLine `json:"transcript"`
	Scorecard    *Scorecard       `json:"scorecard,omitempty"`
	HasRecording bool             `json:"hasRecording"`
	Error        string           `json:"error"`
}

// LiveSession is what the page needs to open the voice connection.
type LiveSession struct {
	SessionID string         `json:"sessionId"`
	Token     string         `json:"token"`
	WSURL     string         `json:"wsUrl"`
	Setup     map[string]any `json:"setup"`
	Minutes   int            `json:"minutes"`
}

type Nudge struct {
	Nudge string `json:"nudge"`
	Kind  string `json:"kind"` // tip | good
}

var (
	interviewKinds = map[string]string{
		"phone_screen":   "phone screen",
		"behavioral":     "behavioral",
		"technical":      "technical (a verbal talk-through, no live coding)",
		"hiring_manager": "hiring manager",
		"final_round":    "final round",
	}
	interviewPersonas = map[string]string{
		"friendly": "warm and encouraging, but still realistic",
		"neutral":  "professional and neutral",
		"tough":    "demanding: probe vague answers, ask pointed follow-ups and push back on weak reasoning",
	}
	interviewMinutes = map[int]bool{10: true, 25: true, 45: true}
	interviewVoices  = map[string]bool{"Kore": true, "Puck": true, "Charon": true, "Aoede": true}
)

func validateInterviewSetup(s *InterviewSetup) error {
	if _, ok := interviewKinds[s.Kind]; !ok {
		return fmt.Errorf("unknown interview type %q", s.Kind)
	}
	if !interviewMinutes[s.Minutes] {
		return errors.New("length must be 10, 25 or 45 minutes")
	}
	if _, ok := interviewPersonas[s.Persona]; !ok {
		return fmt.Errorf("unknown interviewer style %q", s.Persona)
	}
	if s.Voice == "" {
		s.Voice = "Kore"
	}
	if !interviewVoices[s.Voice] {
		return fmt.Errorf("unknown voice %q", s.Voice)
	}
	s.Focus = strings.TrimSpace(s.Focus)
	return nil
}

// buildInterviewBrief is the interviewer's system instruction.
func buildInterviewBrief(job Job, contacts []Contact, resume string, s InterviewSetup) string {
	var b strings.Builder
	fmt.Fprintf(&b, "You are an interviewer at %s conducting a %s interview for the %s role. ", job.Company, interviewKinds[s.Kind], job.Position)
	fmt.Fprintf(&b, "The interview lasts %d minutes. Be a %s interviewer: %s.\n\n", s.Minutes, s.Persona, interviewPersonas[s.Persona])
	b.WriteString(`How to run it:
- Greet the candidate briefly and introduce yourself with a plausible first name and title.
- Ask one question at a time, then listen. Ask realistic follow-ups based on what they actually said.
- Ground questions in the job description and in the candidate's real experience from their resume.
- Never coach, grade or give feedback during the interview. Stay in character the whole time.
- You'll receive silent timekeeper notes in [square brackets]. Never mention or read them out; when told time is nearly up, wrap up and invite the candidate's questions, then answer them in character. When told time is up, thank the candidate and close the interview.
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
		b.WriteString("\nPeople the candidate knows at the company (you may play one of these roles):\n")
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

// liveSetup is the Live API setup message (also locked into the session token).
func liveSetup(model, voice, brief string) map[string]any {
	return map[string]any{
		"model": "models/" + model,
		"generationConfig": map[string]any{
			"responseModalities": []string{"AUDIO"},
			"speechConfig":       map[string]any{"voiceConfig": map[string]any{"prebuiltVoiceConfig": map[string]any{"voiceName": voice}}},
		},
		"systemInstruction":        map[string]any{"parts": []map[string]any{{"text": brief}}},
		"inputAudioTranscription":  map[string]any{},
		"outputAudioTranscription": map[string]any{},
		"contextWindowCompression": map[string]any{"slidingWindow": map[string]any{}},
		"sessionResumption":        map[string]any{},
	}
}

// ---- storage ----

const mockColumns = `m.id, m.job_id, j.company, j.position, m.kind, m.minutes, m.persona, m.voice, m.focus, m.status,
	m.started_at, m.ended_at, m.transcript, m.scorecard, m.recording_path, m.error`

func scanMock(s rowScanner) (MockInterview, error) {
	var m MockInterview
	var transcript, scorecard, recording string
	err := s.Scan(&m.ID, &m.JobID, &m.Company, &m.Position, &m.Kind, &m.Minutes, &m.Persona, &m.Voice, &m.Focus, &m.Status,
		&m.StartedAt, &m.EndedAt, &transcript, &scorecard, &recording, &m.Error)
	if err != nil {
		return m, err
	}
	m.Transcript = []TranscriptLine{}
	_ = json.Unmarshal([]byte(transcript), &m.Transcript)
	if scorecard != "" {
		var sc Scorecard
		if json.Unmarshal([]byte(scorecard), &sc) == nil {
			m.Scorecard = &sc
		}
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
	_, err := r.db.Exec(`INSERT INTO mock_interviews (id, job_id, kind, minutes, persona, voice, focus, status, started_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 'live', ?)`, id, jobID, s.Kind, s.Minutes, s.Persona, s.Voice, s.Focus, ts(r.now()))
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
	rows, err := r.db.Query(`SELECT `+mockColumns+` FROM mock_interviews m JOIN jobs j ON j.id = m.job_id
		WHERE m.job_id = ? ORDER BY m.started_at DESC`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MockInterview{}
	for rows.Next() {
		m, err := scanMock(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *Repo) recordingPath(id string) string {
	var p string
	_ = r.db.QueryRow(`SELECT recording_path FROM mock_interviews WHERE id = ?`, id).Scan(&p)
	return p
}

func (r *Repo) SaveInterviewTranscript(id string, lines []TranscriptLine) error {
	if lines == nil {
		lines = []TranscriptLine{}
	}
	raw, _ := json.Marshal(lines)
	res, err := r.db.Exec(`UPDATE mock_interviews SET transcript = ? WHERE id = ?`, string(raw), id)
	return expectOneRow(res, err, "mock interview", id)
}

func (r *Repo) SetInterviewRecording(id, path string) error {
	res, err := r.db.Exec(`UPDATE mock_interviews SET recording_path = ? WHERE id = ?`, path, id)
	return expectOneRow(res, err, "mock interview", id)
}

func (r *Repo) setInterviewStatus(id, status string, card *Scorecard, errText string) error {
	scorecard := ""
	if card != nil {
		raw, _ := json.Marshal(card)
		scorecard = string(raw)
	}
	_, err := r.db.Exec(`UPDATE mock_interviews SET status = ?, scorecard = CASE WHEN ? = '' THEN scorecard ELSE ? END,
		error = ?, ended_at = CASE WHEN ended_at = '' THEN ? ELSE ended_at END WHERE id = ?`,
		status, scorecard, scorecard, errText, ts(r.now()), id)
	return err
}

func (r *Repo) DeleteMockInterview(id string) error {
	path := r.recordingPath(id)
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
		_ = r.setInterviewStatus(mi.ID, "failed", nil, err.Error())
		return LiveSession{}, err
	}
	return LiveSession{SessionID: mi.ID, Token: token, WSURL: geminiLiveURL, Setup: setupMsg, Minutes: setup.Minutes}, nil
}

var nudgeSchema = map[string]any{
	"type": "OBJECT",
	"properties": map[string]any{
		"nudge": map[string]any{"type": "STRING"},
		"kind":  map[string]any{"type": "STRING", "enum": []string{"tip", "good"}},
	},
	"required": []string{"nudge", "kind"},
}

func nudgeAnswer(ctx context.Context, s Settings, question, answer string) (Nudge, error) {
	var n Nudge
	err := generateJSON(ctx, s.GeminiKey, s.GeminiTextModel,
		"You are a discreet interview coach. Give ONE short cue (max 12 words) about the candidate's last answer: "+
			"either the single most useful improvement (kind: tip) or brief praise if it was strong (kind: good). No preamble.",
		[]geminiPart{{Text: "Interviewer asked: " + question + "\nCandidate answered: " + answer}}, nudgeSchema, &n)
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

func clampScore(v int) int { return max(1, min(v, 5)) }

// scoreInterview turns the transcript into a scorecard. Failures are recorded on
// the session (status "failed") so the transcript is kept and scoring can be retried.
func scoreInterview(ctx context.Context, r *Repo, s Settings, id string) (MockInterview, error) {
	mi, err := r.GetMockInterview(id)
	if err != nil {
		return mi, err
	}
	fail := func(err error) (MockInterview, error) {
		_ = r.setInterviewStatus(id, "failed", nil, err.Error())
		m, _ := r.GetMockInterview(id)
		return m, err
	}
	if len(mi.Transcript) == 0 {
		return fail(errors.New("nothing was said, so there's nothing to score"))
	}
	if err := r.setInterviewStatus(id, "scoring", nil, ""); err != nil {
		return mi, err
	}
	job, err := r.GetJob(mi.JobID)
	if err != nil {
		return fail(err)
	}
	profile, _ := r.GetProfile()
	var t strings.Builder
	for _, l := range mi.Transcript {
		who := "Interviewer"
		if l.Speaker == "you" {
			who = "Candidate"
		}
		fmt.Fprintf(&t, "%s: %s\n", who, l.Text)
	}
	prompt := fmt.Sprintf("Role: %s at %s (%s interview, %s interviewer).\n\nJob description:\n%s\n\nCandidate's resume:\n%s\n\nTranscript:\n%s",
		job.Position, job.Company, interviewKinds[mi.Kind], mi.Persona, orDefault(job.Description, "(not provided)"),
		orDefault(profile.ResumeText, "(not provided)"), t.String())
	var card Scorecard
	err = generateJSON(ctx, s.GeminiKey, s.GeminiTextModel,
		"You are an expert interview coach reviewing a mock interview. Score each dimension 1-5 (5 = excellent): "+
			"communication (clarity, concision), structure (STAR or similar), relevance (answers the question, fits the role), "+
			"depth (specifics, metrics, ownership), confidence (decisive, composed). For every interviewer question give a short "+
			"answer summary, what worked, what to improve and a stronger example answer written in the candidate's voice using "+
			"only facts from their answers and resume. End with exactly three things to practice next. Be candid and specific.",
		[]geminiPart{{Text: prompt}}, scorecardSchema, &card)
	if err != nil {
		return fail(err)
	}
	o := &card.Overall
	o.Communication, o.Structure, o.Relevance = clampScore(o.Communication), clampScore(o.Structure), clampScore(o.Relevance)
	o.Depth, o.Confidence = clampScore(o.Depth), clampScore(o.Confidence)
	if card.Questions == nil {
		card.Questions = []QuestionReview{}
	}
	if err := r.setInterviewStatus(id, "done", &card, ""); err != nil {
		return mi, err
	}
	return r.GetMockInterview(id)
}

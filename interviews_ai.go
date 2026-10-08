// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"cmp"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"

	"jobtrack/internal/gemini"
	"jobtrack/internal/settings"
	"jobtrack/internal/textproc"
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
	// PlanProvider overrides the plan provider setting for this interview: an
	// aiProvider id, planNone, or "" for the setting.
	PlanProvider string `json:"planProvider"`
	// RetryOf reuses that interview's question plan, type and length.
	RetryOf string `json:"retryOf"`
}

// Transcript speakers.
const (
	SpeakerInterviewer = "interviewer"
	SpeakerCandidate   = "you"
)

type TranscriptLine struct {
	Speaker string  `json:"speaker"` // a Speaker* constant
	Text    string  `json:"text"`
	AtMs    int64   `json:"atMs"`
	CutOff  *CutOff `json:"cutOff,omitempty"` // set on an interviewer line the candidate's speech stopped
}

// CutOff records, for an interviewer line the candidate's speech stopped, how
// long the interviewer had been talking and how soon after the candidate's
// previous words it had started (-1 when it didn't follow the candidate).
type CutOff struct {
	SpokeMs int64 `json:"spokeMs"`
	GapMs   int64 `json:"gapMs"`
}

// A cut-off counts as the interviewer jumping into a thinking pause, rather than
// the candidate interrupting, when the interviewer started right after the
// candidate's words and the candidate carried on almost at once.
const (
	pauseCutInMaxGapMs   = thinkingPauseMs + 2500 // the turn-detection wait plus reply latency
	pauseCutInMaxSpokeMs = 3000
)

func (c CutOff) duringPause() bool {
	return c.GapMs >= 0 && c.GapMs <= pauseCutInMaxGapMs && c.SpokeMs <= pauseCutInMaxSpokeMs
}

// label is how the scoring transcript marks this cut-off.
func (c CutOff) label() string {
	if c.duringPause() {
		return "[cut in while the candidate paused]"
	}
	return "[interrupted by the candidate]"
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
	// PlanIndex is the planned question this answers (0-based); nil for an
	// off-plan question or an interview without a plan.
	PlanIndex *int `json:"planIndex,omitempty"`
}

type Scorecard struct {
	Overall      ScoreSet         `json:"overall"`
	Summary      string           `json:"summary"`
	Questions    []QuestionReview `json:"questions"`
	PracticeNext []string         `json:"practiceNext"`
}

// Mock interview statuses: live → scoring → done, or failed (kept so scoring can
// be retried). unscored: ended with no scorecard (every card was deleted).
const (
	MockLive     = "live"
	MockScoring  = "scoring"
	MockDone     = "done"
	MockFailed   = "failed"
	MockUnscored = "unscored"
)

type MockInterview struct {
	ID              string            `json:"id"`
	JobID           string            `json:"jobId"`
	Company         string            `json:"company"`
	Position        string            `json:"position"`
	Kind            string            `json:"kind"`
	Minutes         int               `json:"minutes"`
	Persona         string            `json:"persona"`
	Voice           string            `json:"voice"`
	InterviewerName string            `json:"interviewerName"`
	Focus           string            `json:"focus"`
	Status          string            `json:"status"` // a Mock* constant
	StartedAt       string            `json:"startedAt"`
	EndedAt         string            `json:"endedAt"`
	Transcript      []TranscriptLine  `json:"transcript"`
	Scorecards      []ScorecardResult `json:"scorecards"`          // one per grading provider, newest first
	Scorecard       *Scorecard        `json:"scorecard,omitempty"` // the newest scorecard
	Tips            []InterviewTip    `json:"tips"`                // coaching tips, in answer order
	HasRecording    bool              `json:"hasRecording"`
	Error           string            `json:"error"`
	// The question plan ("" / nil when the interview had none) and the attempts
	// sharing it, oldest first. Attempt is 1-based; 0 without a plan.
	PlanID    string               `json:"planId"`
	Plan      *InterviewPlanRecord `json:"plan,omitempty"`
	PlanError string               `json:"planError"` // set when the stored plan can't be read
	Attempt   int                  `json:"attempt"`
	Attempts  []AttemptSummary     `json:"attempts"`
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

// buildInterviewBrief is the interviewer's system instruction. s must already be
// validated; plan is nil when the interview has no question plan.
func buildInterviewBrief(job Job, contacts []Contact, resume string, s InterviewSetup, plan *InterviewPlan) string {
	kind, _ := findInterviewKind(s.Kind)
	persona, _ := findInterviewPersona(s.Persona)
	var b strings.Builder
	fmt.Fprintf(&b, "You are %s, %s at %s, conducting a %s interview for the %s role. ", s.InterviewerName, kind.interviewer, job.Company, kind.briefName, job.Position)
	fmt.Fprintf(&b, "The interview lasts %d minutes. Be a %s interviewer: %s.\n\n", s.Minutes, s.Persona, persona.briefStyle)
	b.WriteString(`How to run it:
- Greet the candidate briefly and introduce yourself by name and role.
- Ask one question at a time, then listen. Ask realistic follow-ups based on what they actually said.
- Ground questions in the job description and in the candidate's real experience from their resume.
- Go deep before moving on. After each answer, ask at least one follow-up that digs into their own part: what they personally did, why they chose that approach over the alternatives, what they'd do differently.
- Ask for specifics. If an answer is vague or says "we" throughout, ask for the concrete situation, the numbers, the result, or exactly what they contributed.
- Test claims. When the candidate states an achievement, ask how it was measured and what the baseline was.
- Don't accept a polished summary as the whole answer. If an answer sounds rehearsed, probe for one detail that couldn't have been rehearsed.
- One topic at a time. Finish a thread before starting a new one, and keep your own turns short.
- Never coach, grade or give feedback during the interview. Stay in character the whole time.
- You'll receive silent timekeeper notes in [square brackets]. Never mention or read them out; when told time is nearly up, wrap up and invite the candidate's questions, then answer them in character. When told time is up, thank the candidate and close the interview.
- If the candidate stops mid-sentence or trails off, they're probably pausing to think. Don't move on: wait, or briefly invite them to continue ("Take your time" / "Go on").
- Speak naturally and concisely, like a real person on a call.
`)
	if s.Focus != "" {
		fmt.Fprintf(&b, "- The candidate asked to practice: %s. Make sure this comes up.\n", s.Focus)
	}
	if plan != nil {
		b.WriteString("\n" + plan.briefSection())
	}
	fmt.Fprintf(&b, "\nJob description:\n%s\n", textproc.OrDefault(job.Description, "(not provided)"))
	if strings.TrimSpace(job.Notes) != "" {
		fmt.Fprintf(&b, "\nThe candidate's own notes about this job (context only):\n%s\n", job.Notes)
	}
	if len(contacts) > 0 {
		b.WriteString("\nPeople the candidate has been in touch with at the company (background only; you are not one of them):\n")
		for _, c := range contacts {
			fmt.Fprintf(&b, "- %s, %s\n", c.Name, textproc.OrDefault(c.Role, "role unknown"))
		}
	}
	if strings.TrimSpace(resume) == "" {
		b.WriteString("\nNo resume was provided; ask about their background in general terms.\n")
	} else {
		fmt.Fprintf(&b, "\nThe candidate's resume:\n%s\n", resume)
	}
	return b.String()
}

// thinkingPauseMs is how long the candidate can go quiet before the Live API
// decides their turn is over. Its default is tuned for quick chat; interview
// answers have breaths and thinking pauses mid-sentence.
const thinkingPauseMs = 1500

// liveSetup is the interview's setup message (also locked into the session token):
// the voice setup plus patient turn detection, transcripts, long-session
// compression and resumption.
func liveSetup(model, voice, brief string) map[string]any {
	setup := gemini.LiveVoiceSetup(model, voice, brief)
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
	// Rejoin starts a fresh session after the old one couldn't be resumed; the
	// page follows it with the conversation so far.
	Rejoin string `json:"rejoin"`
}

// liveCues builds the session's notes; with a plan, the wrap-up note also asks
// for any core question still unasked.
func liveCues(minutes int, hasPlan bool) LiveCues {
	warnMinutes := 4
	if minutes <= 10 {
		warnMinutes = 2
	}
	wrapUp := fmt.Sprintf("Timekeeper: about %d minutes remain. Start wrapping up after the current answer.", warnMinutes)
	if hasPlan {
		wrapUp += " If a core question from your plan hasn't been asked yet, ask the most important one before wrapping up."
	}
	const msPerMinute = 60_000
	return LiveCues{
		Start:      "(The candidate has joined the call. Begin the interview.)",
		WrapUp:     "[" + wrapUp + "]",
		WrapUpAtMs: int64(minutes-warnMinutes) * msPerMinute,
		TimeUp:     "[Timekeeper: time is up. Thank the candidate and close the interview now.]",
		TimeUpAtMs: int64(minutes) * msPerMinute,
		Rejoin: "(The call dropped and the candidate has reconnected. Below is the conversation so far. Continue the " +
			"interview from where it left off, without greeting again or repeating questions already asked.)",
	}
}

// ---- storage ----

const mockColumns = `m.id, m.job_id, j.company, j.position, m.kind, m.minutes, m.persona, m.voice, m.interviewer_name, m.focus, m.status,
	m.started_at, m.ended_at, m.transcript, m.recording_path, m.error, m.plan_id`

func scanMock(s rowScanner) (MockInterview, error) {
	var m MockInterview
	var transcript, recording string
	err := s.Scan(&m.ID, &m.JobID, &m.Company, &m.Position, &m.Kind, &m.Minutes, &m.Persona, &m.Voice, &m.InterviewerName, &m.Focus, &m.Status,
		&m.StartedAt, &m.EndedAt, &transcript, &recording, &m.Error, &m.PlanID)
	if err != nil {
		return m, err
	}
	m.Transcript = []TranscriptLine{}
	if err := json.Unmarshal([]byte(transcript), &m.Transcript); err != nil {
		return m, fmt.Errorf("mock interview %s: unreadable transcript: %w", m.ID, err)
	}
	m.HasRecording = recording != ""
	return m, nil
}

// CreateMockInterview starts a session record; planID is "" when there is no question plan.
func (r *Repo) CreateMockInterview(jobID string, s InterviewSetup, planID string) (MockInterview, error) {
	if err := validateInterviewSetup(&s); err != nil {
		return MockInterview{}, err
	}
	if _, err := r.GetJob(jobID); err != nil {
		return MockInterview{}, err
	}
	id := newID()
	_, err := r.db.Exec(`INSERT INTO mock_interviews (id, job_id, kind, minutes, persona, voice, interviewer_name, focus, status, started_at, plan_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, jobID, s.Kind, s.Minutes, s.Persona, s.Voice, s.InterviewerName, s.Focus, MockLive, ts(r.now()), planID)
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
	if err != nil {
		return m, err
	}
	if err := r.loadReviewData(&m); err != nil {
		return m, err
	}
	return m, r.loadPlanData(&m)
}

func (r *Repo) ListMockInterviews(jobID string) ([]MockInterview, error) {
	list, err := queryAll(r.db, scanMock, `SELECT `+mockColumns+` FROM mock_interviews m JOIN jobs j ON j.id = m.job_id
		WHERE m.job_id = ? ORDER BY m.started_at DESC`, jobID)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if err := r.loadReviewData(&list[i]); err != nil {
			return nil, err
		}
		if err := r.loadPlanData(&list[i]); err != nil {
			return nil, err
		}
	}
	return list, nil
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

// markDone saves the provider's scorecard and marks the interview scored.
func (r *Repo) markDone(id, provider, model string, card Scorecard) error {
	if err := r.saveScorecard(id, provider, model, card); err != nil {
		return err
	}
	_, err := r.db.Exec(`UPDATE mock_interviews SET status = ?, error = '', `+endedAtOnce+` WHERE id = ?`,
		MockDone, ts(r.now()), id)
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
	if err := r.deleteMockAndOrphanPlan(id); err != nil {
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

// prepareInterview gets everything ready for a live session: the question plan
// (made by the plan provider, reused for a retry, or none), the brief and the
// Live token. Nothing is stored until the token succeeds, so a failure at any
// step leaves no interview or plan behind.
func prepareInterview(ctx context.Context, r *Repo, s settings.Settings, jobID string, setup InterviewSetup) (LiveSession, error) {
	settings.ApplyDefaults(&s)
	if s.GeminiKey == "" {
		return LiveSession{}, gemini.ErrNoKey
	}
	var reused *InterviewPlanRecord
	if setup.RetryOf != "" {
		original, err := r.GetMockInterview(setup.RetryOf)
		if err != nil {
			return LiveSession{}, err
		}
		if original.Plan == nil || original.JobID != jobID {
			return LiveSession{}, errNoPlanToRetry
		}
		setup.Kind, setup.Minutes = original.Kind, original.Minutes
		reused = original.Plan
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
	keptKey := ""
	if provider := cmp.Or(setup.PlanProvider, s.PlanProvider); reused == nil && provider != planNone {
		keptKey = keptPlanKey(jobID, provider, setup)
		reused = r.kept.take(keptKey, r.now())
	}
	plan, err := interviewPlanFor(ctx, s, job, profile.ResumeText, setup, reused)
	if err != nil {
		return LiveSession{}, err
	}
	var brief *InterviewPlan
	if plan != nil {
		brief = &plan.Plan
	}
	setupMsg := liveSetup(s.GeminiLiveModel, setup.Voice, buildInterviewBrief(job, contacts, profile.ResumeText, setup, brief))
	token, err := gemini.CreateLiveToken(ctx, s.GeminiKey, setupMsg, setup.Minutes, r.now())
	if err != nil {
		if keptKey != "" && plan != nil {
			r.kept.keep(keptKey, plan, r.now()) // so Try again doesn't write a new plan
		}
		return LiveSession{}, err
	}
	mi, err := r.createPlannedInterview(jobID, setup, plan)
	if err != nil {
		return LiveSession{}, err
	}
	return LiveSession{SessionID: mi.ID, Token: token, WSURL: gemini.LiveURL, Setup: setupMsg, Minutes: setup.Minutes,
		Kind: setup.Kind, Company: job.Company, Position: job.Position, Voice: setup.Voice, InterviewerName: setup.InterviewerName,
		Cues: liveCues(setup.Minutes, plan != nil)}, nil
}

// nudgeAnswer asks the tips provider for one coaching cue about the answer that
// started at answerAtMs, and saves it with the interview for later review.
func nudgeAnswer(ctx context.Context, r *Repo, s settings.Settings, sessionID, question, answer string, answerAtMs int64) (Nudge, error) {
	settings.ApplyDefaults(&s)
	var n Nudge
	model, err := runAITask(ctx, s, s.TipsProvider, nudgeTask(question, answer), &n)
	if err != nil {
		return n, err
	}
	tip := InterviewTip{AnswerAtMs: answerAtMs, Kind: n.Kind, Text: n.Nudge, Provider: s.TipsProvider, Model: model}
	return n, r.saveTip(sessionID, tip)
}

func clampScore(v int) int { return clamp(v, 1, 5) }

// scoreInterview turns the transcript into a scorecard. Failures are recorded on
// the session (status "failed") so the transcript is kept and scoring can be retried.
func scoreInterview(ctx context.Context, r *Repo, s settings.Settings, id string) (MockInterview, error) {
	settings.ApplyDefaults(&s)
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
	card, model, err := requestScorecard(ctx, r, s, s.GradingProvider, mi)
	if err != nil {
		return r.failScoring(mi, err)
	}
	if err := r.markDone(id, s.GradingProvider, model, card); err != nil {
		return mi, err
	}
	return r.GetMockInterview(id)
}

// regradeInterview grades an interview again with a chosen provider and adds (or
// replaces) that provider's scorecard. On failure the interview keeps its
// status and existing scorecards; only the error is returned.
func regradeInterview(ctx context.Context, r *Repo, s settings.Settings, id, provider string) (MockInterview, error) {
	settings.ApplyDefaults(&s)
	mi, err := r.GetMockInterview(id)
	if err != nil {
		return mi, err
	}
	if len(mi.Transcript) == 0 {
		return mi, errors.New("nothing was said, so there's nothing to score")
	}
	card, model, err := requestScorecard(ctx, r, s, provider, mi)
	if err != nil {
		return mi, err
	}
	if err := r.markDone(id, provider, model, card); err != nil {
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

// requestScorecard asks a provider to review the session against the job and
// resume; it also returns the model that graded it.
func requestScorecard(ctx context.Context, r *Repo, s settings.Settings, provider string, mi MockInterview) (Scorecard, string, error) {
	var card Scorecard
	job, err := r.GetJob(mi.JobID)
	if err != nil {
		return card, "", err
	}
	profile, err := r.GetProfile()
	if err != nil {
		return card, "", err
	}
	model, err := runAITask(ctx, s, provider, scorecardTask(job, mi, profile.ResumeText), &card)
	if err != nil {
		return card, "", err
	}
	card.normalize()
	return card, model, nil
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

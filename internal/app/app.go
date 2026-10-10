// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"jobtrack/internal/ai"
	"jobtrack/internal/comp"
	"jobtrack/internal/discover"
	"jobtrack/internal/marketdata"
	"jobtrack/internal/osproc"
	"jobtrack/internal/settings"
	"jobtrack/internal/taxes"
)

// App is the thin layer bound to the frontend. Every exported method is
// callable from JavaScript; the real work lives in Repo and the domain files.
//
// If startup fails (initErr), the frontend asks GetStartupError first and shows
// only the error screen, so no other method is called. That's why methods don't
// each re-check initErr; a stray call would come back as Wails' recovered-panic
// error, not a crash.
type App struct {
	ctx      context.Context
	dataDir  string
	repo     *Repo
	settings *settings.SettingsStore
	window   *settings.WindowStateStore
	market   *marketdata.MarketData // nil if the embedded dataset can't be read; comp figures then skip market data
	// lifetimeCtx lives as long as the app; shutdown cancels it so background
	// work (searches and their scraper processes, headless Claude Code, API
	// calls) never outlives the window.
	lifetimeCtx    context.Context
	lifetimeCancel context.CancelFunc
	initErr        error
	windowShown    bool
	matchMu        sync.Mutex // one scoring run at a time
}

// NewApp opens (and if needed creates or migrates) the data folder. A failure
// is kept in initErr and shown full-screen by the frontend instead of crashing.
func NewApp(dataDir string) *App {
	a := &App{dataDir: dataDir, settings: settings.NewSettingsStore(dataDir), window: settings.NewWindowStateStore(dataDir)}
	a.lifetimeCtx, a.lifetimeCancel = context.WithCancel(context.Background())
	if md, err := marketdata.Load(); err != nil {
		log.Printf("market data unavailable: %v", err)
	} else {
		a.market = md
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		a.initErr = err
		return a
	}
	db, err := openDB(filepath.Join(dataDir, "jobtrack.db"))
	if err != nil {
		a.initErr = err
		return a
	}
	a.repo = NewRepo(db, filepath.Join(dataDir, "files"))
	if _, err := a.repo.ImportLegacy(filepath.Join(dataDir, "data.json")); err != nil {
		a.initErr = fmt.Errorf("importing your old data.json failed (it was left untouched): %w", err)
	}
	return a
}

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

// lifetimeContext is the context for background work; it ends when the app closes.
func (a *App) lifetimeContext() context.Context { return a.lifetimeCtx }

func (a *App) shutdown(ctx context.Context) {
	a.lifetimeCancel()
	if a.repo != nil {
		a.repo.db.Close()
	}
}

func (a *App) followUpDays() int {
	s, err := a.settings.Load()
	if err != nil {
		return settings.DefaultFollowUpDays
	}
	return s.FollowUpDays
}

// GetStartupError returns "" when the app started normally.
func (a *App) GetStartupError() string {
	if a.initErr != nil {
		return a.initErr.Error()
	}
	return ""
}

// ---- Jobs ----

func (a *App) ListJobSummaries() ([]JobSummary, error) {
	settings, err := a.settings.Load()
	if err != nil {
		return nil, err
	}
	summaries, err := a.repo.ListJobSummaries(settings.FollowUpDays)
	if err != nil {
		return nil, err
	}
	packages, err := a.repo.ListCompPackages()
	if err != nil {
		return nil, err
	}
	md := a.market
	withOfferTotals(summaries, packages, func(p comp.CompPackage) (comp.PackageResult, error) {
		return comp.Evaluate(p, settings, md, nil)
	})
	return summaries, nil
}

func (a *App) GetMetrics() (Metrics, error) {
	return a.repo.GetMetrics(a.followUpDays())
}

func (a *App) GetJob(id string) (Job, error) {
	return a.repo.GetJob(id)
}

func (a *App) CreateJob(j Job) (Job, error) {
	return a.repo.CreateJob(j)
}

func (a *App) UpdateJob(j Job) (Job, error) {
	return a.repo.UpdateJob(j)
}

func (a *App) UpdateJobNotes(id, notes string) error {
	return a.repo.UpdateJobNotes(id, notes)
}

func (a *App) ChangeStatus(id, status, reason, note string) (Job, error) {
	return a.repo.ChangeStatus(id, status, reason, note)
}

func (a *App) DeleteJob(id string) error {
	return a.repo.DeleteJob(id)
}

func (a *App) ListStageEvents(jobID string) ([]StageEvent, error) {
	return a.repo.ListStageEvents(jobID)
}

// ---- Contacts & interviews ----

func (a *App) ListContacts(jobID string) ([]Contact, error) {
	return a.repo.ListContacts(jobID)
}

func (a *App) SaveContact(c Contact) (Contact, error) {
	return a.repo.SaveContact(c)
}

func (a *App) DeleteContact(id string) error {
	return a.repo.DeleteContact(id)
}

func (a *App) ListInterviews(jobID string) ([]Interview, error) {
	return a.repo.ListInterviews(jobID)
}

func (a *App) SaveInterview(iv Interview) (Interview, error) {
	return a.repo.SaveInterview(iv)
}

func (a *App) DeleteInterview(id string) error {
	return a.repo.DeleteInterview(id)
}

// ---- Attachments ----

func (a *App) ListAttachments(jobID string) ([]Attachment, error) {
	return a.repo.ListAttachments(jobID)
}

// PickAndAttachFile shows the native file dialog; it returns nil if cancelled.
func (a *App) PickAndAttachFile(jobID string) (*Attachment, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "Attach a file"})
	if err != nil || path == "" {
		return nil, err
	}
	att, err := a.repo.AddAttachment(jobID, path, "")
	if err != nil {
		return nil, err
	}
	return &att, nil
}

func (a *App) OpenAttachment(id string) error {
	att, err := a.repo.GetAttachment(id)
	if err != nil {
		return err
	}
	if _, err := os.Stat(att.StoredPath); err != nil {
		return fmt.Errorf("the stored copy of %s is missing", att.FileName)
	}
	return osproc.OpenWithOS(att.StoredPath)
}

func (a *App) RenameAttachment(id, label string) error {
	return a.repo.RenameAttachment(id, label)
}

// ShowAttachmentInFolder opens the file manager with the stored copy selected.
func (a *App) ShowAttachmentInFolder(id string) error {
	att, err := a.repo.GetAttachment(id)
	if err != nil {
		return err
	}
	return osproc.RevealInFolder(att.StoredPath)
}

func (a *App) DeleteAttachment(id string) error {
	return a.repo.DeleteAttachment(id)
}

// ---- Discover ----

// RunSearch files a search's results into the Discover inbox, reusing them if
// the same search ran recently.
func (a *App) RunSearch(q SearchQuery) (SearchRun, error) {
	settings, err := a.settings.Load()
	if err != nil {
		return SearchRun{}, err
	}
	fetcher := sourceFetcher{settings: settings, repo: a.repo}
	fetch := withProgress(fetcher.fetch, len(normalizeSources(q.Sources)), a.reportProgress("search:progress"))
	return RunSearch(a.lifetimeContext(), a.repo, q, settings, fetch)
}

// RefreshSearch fetches new postings for a search even if it ran recently.
func (a *App) RefreshSearch(q SearchQuery) (SearchRun, error) {
	settings, err := a.settings.Load()
	if err != nil {
		return SearchRun{}, err
	}
	fetcher := sourceFetcher{settings: settings, repo: a.repo}
	fetch := withProgress(fetcher.fetch, len(normalizeSources(q.Sources)), a.reportProgress("search:progress"))
	return RefreshSearch(a.lifetimeContext(), a.repo, q, fetch)
}

// ListPostings returns a tab's postings, with each match score flagged if it
// was graded against an older resume or preferences.
func (a *App) ListPostings(f PostingFilter) ([]Posting, error) {
	postings, err := a.repo.ListPostings(f)
	if err != nil {
		return nil, err
	}
	fingerprint, err := a.currentMatchFingerprint()
	if err != nil {
		return nil, err
	}
	markOutdated(postings, fingerprint)
	return postings, nil
}

// emit sends an event to the frontend; it does nothing before startup (and in tests).
func (a *App) emit(name string, data any) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, name, data)
	}
}

func (a *App) reportProgress(event string) func(done, total int) {
	return func(done, total int) { a.emit(event, map[string]int{"done": done, "total": total}) }
}

// ScoreInbox scores every inbox and Interested posting that has no match score yet.
func (a *App) ScoreInbox() (MatchRun, error) {
	return a.scoreMatches(func(p Posting, _ string) bool { return p.Match == nil })
}

// RescoreOutdated scores again the postings graded against an older resume or preferences.
func (a *App) RescoreOutdated() (MatchRun, error) {
	return a.scoreMatches(func(p Posting, fingerprint string) bool { return p.Match != nil && p.Match.fingerprint != fingerprint })
}

// ScorePosting scores one posting, or scores it again.
func (a *App) ScorePosting(id string) (MatchRun, error) {
	return a.scoreMatches(func(p Posting, _ string) bool { return p.ID == id })
}

func (a *App) scoreMatches(want func(p Posting, fingerprint string) bool) (MatchRun, error) {
	if !a.matchMu.TryLock() {
		return MatchRun{Error: "Scoring is already running"}, nil
	}
	defer a.matchMu.Unlock()
	s, err := a.settings.Load()
	if err != nil {
		return MatchRun{}, err
	}
	profile, err := a.repo.GetProfile()
	if err != nil {
		return MatchRun{}, err
	}
	fingerprint := matchFingerprint(profile.ResumeText, s)
	postings, err := a.repo.matchCandidates(func(p Posting) bool { return want(p, fingerprint) })
	if err != nil {
		return MatchRun{}, err
	}
	return runMatch(a.lifetimeContext(), a.repo, s, profile.ResumeText, postings, a.reportProgress("match:progress"))
}

// currentMatchFingerprint identifies the resume and preferences new scores are graded against.
func (a *App) currentMatchFingerprint() (string, error) {
	s, err := a.settings.Load()
	if err != nil {
		return "", err
	}
	profile, err := a.repo.GetProfile()
	if err != nil {
		return "", err
	}
	return matchFingerprint(profile.ResumeText, s), nil
}

func (a *App) InboxCounts() (InboxCounts, error) {
	return a.repo.InboxCounts()
}

func (a *App) MarkPostingSeen(id string) error {
	return a.repo.MarkPostingSeen(id)
}

func (a *App) DismissPosting(id string) error {
	return a.repo.DismissPosting(id)
}

func (a *App) RestorePosting(id string) error {
	return a.repo.RestorePosting(id)
}

func (a *App) SavePosting(id string) (Job, error) {
	return a.repo.SavePosting(id)
}

func (a *App) ClearDismissed(olderThanDays int) (int, error) {
	return a.repo.ClearDismissed(olderThanDays)
}

// ListJobSources returns every job board, with why each can't be searched yet.
func (a *App) ListJobSources() ([]JobSource, error) {
	settings, err := a.settings.Load()
	if err != nil {
		return nil, err
	}
	return ListJobSources(settings), nil
}

func (a *App) ListRecentSearches() ([]SavedSearch, error) {
	return a.repo.ListRecentSearches(8)
}

func (a *App) DeleteSearch(id string) error {
	return a.repo.DeleteSearch(id)
}

// ---- Settings ----

func (a *App) GetSettings() (settings.Settings, error) {
	return a.settings.Load()
}

// SaveSettings stores s and returns it as stored, with defaults filled in for
// anything left blank.
func (a *App) SaveSettings(s settings.Settings) (settings.Settings, error) {
	s.PythonPath = strings.TrimSpace(s.PythonPath)
	if err := a.settings.Save(s); err != nil {
		return settings.Settings{}, err
	}
	return a.settings.Load()
}

// TestPython reports which Python will be used and whether it can import JobSpy.
func (a *App) TestPython(path string) (string, error) {
	python, err := discover.FindPython(path)
	if err != nil {
		return "", err
	}
	if err := discover.CheckScraper(a.lifetimeContext(), python); err != nil {
		return "", fmt.Errorf("%s: %w", python, err)
	}
	return python, nil
}

func (a *App) DataDir() string { return a.dataDir }

func (a *App) OpenDataDir() error { return osproc.OpenWithOS(a.dataDir) }

// ---- Compensation ----

// ComparisonItem is one package with its computed result, for the Offers page.
type ComparisonItem struct {
	Package   comp.CompPackage   `json:"package"`
	Result    comp.PackageResult `json:"result"`
	Company   string             `json:"company"`
	Position  string             `json:"position"`
	JobStatus string             `json:"jobStatus"`
}

// DataSources describes the external datasets behind marked (✦) figures.
type DataSources struct {
	BLS   marketdata.SourceInfo `json:"bls"`
	BEA   marketdata.SourceInfo `json:"bea"`
	Tax   marketdata.SourceInfo `json:"tax"`
	Built string                `json:"built"`
}

func (a *App) evaluate(p comp.CompPackage, current *comp.CompPackage) (comp.PackageResult, error) {
	s, err := a.settings.Load()
	if err != nil {
		return comp.PackageResult{}, err
	}
	return comp.Evaluate(p, s, a.market, current)
}

func (a *App) comparisonItems(list []comp.CompPackage) ([]ComparisonItem, error) {
	current, err := a.repo.CurrentCompPackage()
	if err != nil {
		return nil, err
	}
	out := make([]ComparisonItem, 0, len(list))
	for _, p := range list {
		res, err := a.evaluate(p, current)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", p.Label, err)
		}
		item := ComparisonItem{Package: p, Result: res, Company: "Current job"}
		if p.JobID != "" {
			j, err := a.repo.GetJob(p.JobID)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", p.Label, err)
			}
			item.Company, item.Position, item.JobStatus = j.Company, j.Position, j.Status
		}
		out = append(out, item)
	}
	return out, nil
}

func (a *App) ListComparisons() ([]ComparisonItem, error) {
	list, err := a.repo.ListCompPackages()
	if err != nil {
		return nil, err
	}
	return a.comparisonItems(list)
}

func (a *App) ListCompForJob(jobID string) ([]ComparisonItem, error) {
	list, err := a.repo.ListCompPackagesForJob(jobID)
	if err != nil {
		return nil, err
	}
	return a.comparisonItems(list)
}

func (a *App) GetCurrentComp() (*comp.CompPackage, error) {
	return a.repo.CurrentCompPackage()
}

func (a *App) SaveCompPackage(p comp.CompPackage) (comp.CompPackage, error) {
	return a.repo.SaveCompPackage(p)
}

func (a *App) DeleteCompPackage(id string) error {
	return a.repo.DeleteCompPackage(id)
}

func (a *App) DraftCounter(offerID string) (comp.CompPackage, error) {
	return a.repo.DraftCounter(offerID)
}

// NewEstimate returns an unsaved estimate prefilled from the job's posted range and location.
func (a *App) NewEstimate(jobID string) (comp.CompPackage, error) {
	j, err := a.repo.GetJob(jobID)
	if err != nil {
		return comp.CompPackage{}, err
	}
	s, err := a.settings.Load()
	if err != nil {
		return comp.CompPackage{}, err
	}
	area, state := "", ""
	if md := a.market; md != nil {
		area, state = md.EstimateLocation(j.Location, s.HomeAreaCode)
	}
	return NewEstimateForJob(j, s.DefaultOccupation, area, state), nil
}

// PreviewComp evaluates an unsaved package for the editor's live preview.
func (a *App) PreviewComp(p comp.CompPackage) (comp.PackageResult, error) {
	current, err := a.repo.CurrentCompPackage()
	if err != nil {
		return comp.PackageResult{}, err
	}
	return a.evaluate(p, current)
}

func (a *App) SearchOccupations(q string) []marketdata.Option {
	if md := a.market; md != nil {
		return md.SearchOccupations(q)
	}
	return []marketdata.Option{}
}

func (a *App) SearchAreas(q string) []marketdata.Option {
	if md := a.market; md != nil {
		return md.SearchAreas(q)
	}
	return []marketdata.Option{}
}

// DescribeArea and DescribeOccupation give pickers the title for a saved code.
func (a *App) DescribeArea(code string) marketdata.Option {
	if md := a.market; md != nil {
		return md.DescribeArea(code)
	}
	return marketdata.CodeOnly(code)
}

func (a *App) DescribeOccupation(code string) marketdata.Option {
	if md := a.market; md != nil {
		return md.DescribeOccupation(code)
	}
	return marketdata.CodeOnly(code)
}

func (a *App) MarketSources() DataSources {
	ds := DataSources{Tax: taxes.Source}
	if md := a.market; md != nil {
		ds.BLS, ds.BEA, ds.Built = md.Sources["bls"], md.Sources["bea"], md.Built
	}
	return ds
}

// ---- AI: resume ----

func (a *App) GetProfile() (Profile, error) {
	return a.repo.GetProfile()
}

func (a *App) UpdateResumeText(text string) error {
	return a.repo.UpdateResumeText(text)
}

// UploadResume picks a resume file, keeps a copy, and extracts its text locally
// (nothing is uploaded). Returns nil if the dialog was cancelled.
func (a *App) UploadResume() (*Profile, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "Choose your resume",
		Filters: []runtime.FileFilter{{DisplayName: "Resume (*.pdf, *.docx, *.txt, *.md)", Pattern: "*.pdf;*.docx;*.txt;*.md"}},
	})
	if err != nil || path == "" {
		return nil, err
	}
	dir := filepath.Join(a.dataDir, "resume")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	dest := filepath.Join(dir, filepath.Base(path))
	if err := copyFile(path, dest); err != nil {
		return nil, err
	}
	text, err := extractResumeText(dest)
	if err != nil {
		return nil, err
	}
	if err := a.repo.SaveResume(filepath.Base(dest), dest, text); err != nil {
		return nil, err
	}
	p, err := a.repo.GetProfile()
	return &p, err
}

// ---- AI: mock interviews ----

func (a *App) PrepareInterview(jobID string, setup InterviewSetup) (LiveSession, error) {
	s, err := a.settings.Load()
	if err != nil {
		return LiveSession{}, err
	}
	return prepareInterview(a.lifetimeContext(), a.repo, s, jobID, setup)
}

// NudgeAnswer returns one short coaching cue for the answer just given.
// The tip is saved with the interview, tied to the answer that started at answerAtMs.
func (a *App) NudgeAnswer(sessionID, question, answer string, answerAtMs int64) (Nudge, error) {
	s, err := a.settings.Load()
	if err != nil {
		return Nudge{}, err
	}
	return nudgeAnswer(a.lifetimeContext(), a.repo, s, sessionID, question, answer, answerAtMs)
}

// RegradeInterview scores an interview again with another provider and keeps both scorecards.
func (a *App) RegradeInterview(id, provider string) (MockInterview, error) {
	s, err := a.settings.Load()
	if err != nil {
		return MockInterview{}, err
	}
	return regradeInterview(a.lifetimeContext(), a.repo, s, id, provider)
}

// DeleteScorecard removes one provider's scorecard from an interview.
func (a *App) DeleteScorecard(id, provider string) error { return a.repo.DeleteScorecard(id, provider) }

// DeleteInterviewRecording removes only the audio; transcript, tips and scorecards stay.
func (a *App) DeleteInterviewRecording(id string) error { return a.repo.DeleteInterviewRecording(id) }

// ListAllMockInterviews lists every mock interview across jobs, newest first.
func (a *App) ListAllMockInterviews() ([]MockInterviewSummary, error) {
	return a.repo.ListAllMockInterviews()
}

// ScoreInterview grades an interview with the grading provider chosen in Settings.
func (a *App) ScoreInterview(id string) (MockInterview, error) {
	s, err := a.settings.Load()
	if err != nil {
		return MockInterview{}, err
	}
	return scoreInterview(a.lifetimeContext(), a.repo, s, id)
}

func (a *App) SaveInterviewTranscript(id string, lines []TranscriptLine) error {
	return a.repo.SaveInterviewTranscript(id, lines)
}

// SaveInterviewRecording stores the session audio (webm/opus, base64 from the page).
func (a *App) SaveInterviewRecording(id, base64Data string) error {
	mi, err := a.repo.GetMockInterview(id)
	if err != nil {
		return err
	}
	raw, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return errors.New("the recording couldn't be decoded")
	}
	dir := filepath.Join(a.dataDir, "files", mi.JobID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("the recording could not be saved: %w", err)
	}
	path := filepath.Join(dir, "interview-"+id+".webm")
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		return fmt.Errorf("the recording could not be saved: %w", err)
	}
	return a.repo.SetInterviewRecording(id, path)
}

// GetInterviewRecording returns the recording as a data URL for the audio player.
func (a *App) GetInterviewRecording(id string) (string, error) {
	raw, err := a.repo.recordingData(id)
	if err != nil || raw == nil {
		return "", err
	}
	return "data:audio/webm;base64," + base64.StdEncoding.EncodeToString(raw), nil
}

func (a *App) ListMockInterviews(jobID string) ([]MockInterview, error) {
	return a.repo.ListMockInterviews(jobID)
}

func (a *App) GetMockInterview(id string) (MockInterview, error) {
	return a.repo.GetMockInterview(id)
}

// ListPlanAttempts returns every attempt at the interview's question plan, oldest first.
func (a *App) ListPlanAttempts(id string) ([]MockInterview, error) {
	return a.repo.ListPlanAttempts(id)
}

func (a *App) DeleteMockInterview(id string) error {
	return a.repo.DeleteMockInterview(id)
}

// ListAIProviders returns every AI provider with why each can't run yet.
func (a *App) ListAIProviders() ([]ai.AIProvider, error) {
	s, err := a.settings.Load()
	if err != nil {
		return nil, err
	}
	return ai.ListAIProviders(s), nil
}

// TestClaudeCode reports the installed Claude Code version (Settings "Test" button).
func (a *App) TestClaudeCode(path string) (string, error) {
	s, err := a.settings.Load()
	if err != nil {
		return "", err
	}
	s.ClaudeCodePath = strings.TrimSpace(path)
	return ai.ClaudeCodeVersion(a.lifetimeContext(), s)
}

// ListAIModels lists the models an OpenAI-style provider offers, using the
// settings as entered on the page (Settings "Load models" button).
func (a *App) ListAIModels(providerID string, s settings.Settings) ([]string, error) {
	return ai.ListAIModels(a.lifetimeContext(), providerID, s)
}

// TestAIProvider runs a tiny task on a provider with the settings as entered
// on the page (Settings "Test" button).
func (a *App) TestAIProvider(providerID string, s settings.Settings) (ai.AIProviderTest, error) {
	return ai.TestAIProvider(a.lifetimeContext(), providerID, s)
}

// ListInterviewOptions returns the interview types, interviewer styles and lengths.
func (a *App) ListInterviewOptions() InterviewOptions { return interviewOptions }

// ListVoices returns the prebuilt interviewer voices with their style.
func (a *App) ListVoices() []VoiceOption { return interviewVoiceList }

// VoicePreview returns a sample of a voice as a WAV data URL (generated once, then cached).
func (a *App) VoicePreview(voice string) (string, error) {
	s, err := a.settings.Load()
	if err != nil {
		return "", err
	}
	wav, err := voicePreview(a.lifetimeContext(), s, filepath.Join(a.dataDir, "voice-previews"), voice)
	if err != nil {
		return "", err
	}
	return "data:audio/wav;base64," + base64.StdEncoding.EncodeToString(wav), nil
}

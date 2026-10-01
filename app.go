package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the thin layer bound to the frontend. Every exported method is
// callable from JavaScript; the real work lives in Repo and discover.go.
type App struct {
	ctx         context.Context
	dataDir     string
	repo        *Repo
	settings    *SettingsStore
	initErr     error
	windowShown bool
}

// NewApp opens (and if needed creates or migrates) the data folder. A failure
// is kept in initErr and shown full-screen by the frontend instead of crashing.
func NewApp(dataDir string) *App {
	a := &App{dataDir: dataDir, settings: NewSettingsStore(dataDir)}
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

func (a *App) shutdown(ctx context.Context) {
	if a.repo != nil {
		a.repo.db.Close()
	}
}

func (a *App) ready() error {
	if a.initErr != nil {
		return a.initErr
	}
	if a.repo == nil {
		return errors.New("database is not available")
	}
	return nil
}

func (a *App) followUpDays() int {
	s, err := a.settings.Load()
	if err != nil {
		return defaultFollowUpDays
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
	if err := a.ready(); err != nil {
		return nil, err
	}
	return a.repo.ListJobSummaries(a.followUpDays())
}

func (a *App) GetMetrics() (Metrics, error) {
	if err := a.ready(); err != nil {
		return Metrics{}, err
	}
	return a.repo.GetMetrics(a.followUpDays())
}

func (a *App) GetJob(id string) (Job, error) {
	if err := a.ready(); err != nil {
		return Job{}, err
	}
	return a.repo.GetJob(id)
}

func (a *App) CreateJob(j Job) (Job, error) {
	if err := a.ready(); err != nil {
		return Job{}, err
	}
	return a.repo.CreateJob(j)
}

func (a *App) UpdateJob(j Job) (Job, error) {
	if err := a.ready(); err != nil {
		return Job{}, err
	}
	return a.repo.UpdateJob(j)
}

func (a *App) UpdateJobNotes(id, notes string) error {
	if err := a.ready(); err != nil {
		return err
	}
	return a.repo.UpdateJobNotes(id, notes)
}

func (a *App) ChangeStatus(id, status, reason, note string) (Job, error) {
	if err := a.ready(); err != nil {
		return Job{}, err
	}
	return a.repo.ChangeStatus(id, status, reason, note)
}

func (a *App) DeleteJob(id string) error {
	if err := a.ready(); err != nil {
		return err
	}
	return a.repo.DeleteJob(id)
}

func (a *App) ListStageEvents(jobID string) ([]StageEvent, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
	return a.repo.ListStageEvents(jobID)
}

// ---- Contacts & interviews ----

func (a *App) ListContacts(jobID string) ([]Contact, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
	return a.repo.ListContacts(jobID)
}

func (a *App) SaveContact(c Contact) (Contact, error) {
	if err := a.ready(); err != nil {
		return Contact{}, err
	}
	return a.repo.SaveContact(c)
}

func (a *App) DeleteContact(id string) error {
	if err := a.ready(); err != nil {
		return err
	}
	return a.repo.DeleteContact(id)
}

func (a *App) ListInterviews(jobID string) ([]Interview, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
	return a.repo.ListInterviews(jobID)
}

func (a *App) SaveInterview(iv Interview) (Interview, error) {
	if err := a.ready(); err != nil {
		return Interview{}, err
	}
	return a.repo.SaveInterview(iv)
}

func (a *App) DeleteInterview(id string) error {
	if err := a.ready(); err != nil {
		return err
	}
	return a.repo.DeleteInterview(id)
}

// ---- Attachments ----

func (a *App) ListAttachments(jobID string) ([]Attachment, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
	return a.repo.ListAttachments(jobID)
}

// PickAndAttachFile shows the native file dialog; it returns nil if cancelled.
func (a *App) PickAndAttachFile(jobID string) (*Attachment, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
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
	if err := a.ready(); err != nil {
		return err
	}
	att, err := a.repo.GetAttachment(id)
	if err != nil {
		return err
	}
	if _, err := os.Stat(att.StoredPath); err != nil {
		return fmt.Errorf("the stored copy of %s is missing", att.FileName)
	}
	return openWithOS(att.StoredPath)
}

func (a *App) DeleteAttachment(id string) error {
	if err := a.ready(); err != nil {
		return err
	}
	return a.repo.DeleteAttachment(id)
}

// ---- Discover ----

func exeDir() string {
	p, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Dir(p)
}

func (a *App) Discover(q DiscoverQuery) (DiscoverResponse, error) {
	if err := a.ready(); err != nil {
		return DiscoverResponse{}, err
	}
	q.Term, q.Location = strings.TrimSpace(q.Term), strings.TrimSpace(q.Location)
	if q.Term == "" {
		return DiscoverResponse{}, errors.New("enter a job title or keywords to search")
	}
	settings, err := a.settings.Load()
	if err != nil {
		return DiscoverResponse{}, err
	}
	tracked, err := a.repo.ListJobs()
	if err != nil {
		return DiscoverResponse{}, err
	}
	cwd, _ := os.Getwd()
	fetch := func(ctx context.Context, source string, q DiscoverQuery) ([]rawJob, error) {
		if source == "adzuna" {
			return adzunaSearch(ctx, settings.AdzunaAppID, settings.AdzunaAppKey, q)
		}
		python, err := resolvePython(settings.PythonPath, exeDir(), cwd)
		if err != nil {
			return nil, err
		}
		return runJobSpy(ctx, python, source, q)
	}
	return runDiscover(context.Background(), q, fetch, tracked), nil
}

// ---- Settings ----

func (a *App) GetSettings() (Settings, error) {
	return a.settings.Load()
}

// SaveSettings keeps the window geometry already on disk; only the app writes those.
func (a *App) SaveSettings(s Settings) error {
	current, err := a.settings.Load()
	if err != nil {
		return err
	}
	s.WindowWidth, s.WindowHeight, s.WindowMaximised = current.WindowWidth, current.WindowHeight, current.WindowMaximised
	s.PythonPath = strings.TrimSpace(s.PythonPath)
	return a.settings.Save(s)
}

// TestPython reports which Python will be used and whether it can import JobSpy.
func (a *App) TestPython(path string) (string, error) {
	cwd, _ := os.Getwd()
	python, err := resolvePython(strings.TrimSpace(path), exeDir(), cwd)
	if err != nil {
		return "", err
	}
	if err := checkScraper(context.Background(), python); err != nil {
		return "", fmt.Errorf("%s: %w", python, err)
	}
	return python, nil
}

func (a *App) DataDir() string { return a.dataDir }

func (a *App) OpenDataDir() error { return openWithOS(a.dataDir) }

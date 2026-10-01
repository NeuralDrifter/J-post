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
	summaries, err := a.repo.ListJobSummaries(a.followUpDays())
	if err != nil {
		return nil, err
	}
	packages, err := a.repo.ListCompPackages()
	if err != nil {
		return nil, err
	}
	offers := map[string]CompPackage{}
	for _, p := range packages {
		if p.Kind == "offer" {
			offers[p.JobID] = p // latest offer per job wins
		}
	}
	for i := range summaries {
		if p, ok := offers[summaries[i].Job.ID]; ok {
			if res, err := a.evaluate(p, nil); err == nil {
				total := res.Year1Total
				summaries[i].OfferYear1Total = &total
			}
		}
	}
	return summaries, nil
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

func (a *App) RenameAttachment(id, label string) error {
	if err := a.ready(); err != nil {
		return err
	}
	return a.repo.RenameAttachment(id, label)
}

// ShowAttachmentInFolder opens the file manager with the stored copy selected.
func (a *App) ShowAttachmentInFolder(id string) error {
	if err := a.ready(); err != nil {
		return err
	}
	att, err := a.repo.GetAttachment(id)
	if err != nil {
		return err
	}
	return revealInFolder(att.StoredPath)
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

// ---- Compensation ----

// ComparisonItem is one package with its computed result, for the Offers page.
type ComparisonItem struct {
	Package   CompPackage   `json:"package"`
	Result    PackageResult `json:"result"`
	Company   string        `json:"company"`
	Position  string        `json:"position"`
	JobStatus string        `json:"jobStatus"`
}

// DataSources describes the external datasets behind marked (✦) figures.
type DataSources struct {
	BLS   SourceInfo `json:"bls"`
	BEA   SourceInfo `json:"bea"`
	Tax   SourceInfo `json:"tax"`
	Built string     `json:"built"`
}

func (a *App) market() *MarketData {
	md, err := loadMarketData()
	if err != nil {
		return nil
	}
	return md
}

func (a *App) evaluate(p CompPackage, current *CompPackage) (PackageResult, error) {
	s, err := a.settings.Load()
	if err != nil {
		return PackageResult{}, err
	}
	return Evaluate(p, s, a.market(), current)
}

func (a *App) comparisonItems(list []CompPackage) ([]ComparisonItem, error) {
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
			if j, err := a.repo.GetJob(p.JobID); err == nil {
				item.Company, item.Position, item.JobStatus = j.Company, j.Position, j.Status
			}
		}
		out = append(out, item)
	}
	return out, nil
}

func (a *App) ListComparisons() ([]ComparisonItem, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
	list, err := a.repo.ListCompPackages()
	if err != nil {
		return nil, err
	}
	return a.comparisonItems(list)
}

func (a *App) ListCompForJob(jobID string) ([]ComparisonItem, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
	list, err := a.repo.ListCompPackagesForJob(jobID)
	if err != nil {
		return nil, err
	}
	return a.comparisonItems(list)
}

func (a *App) GetCurrentComp() (*CompPackage, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
	return a.repo.CurrentCompPackage()
}

func (a *App) SaveCompPackage(p CompPackage) (CompPackage, error) {
	if err := a.ready(); err != nil {
		return CompPackage{}, err
	}
	return a.repo.SaveCompPackage(p)
}

func (a *App) DeleteCompPackage(id string) error {
	if err := a.ready(); err != nil {
		return err
	}
	return a.repo.DeleteCompPackage(id)
}

func (a *App) DraftCounter(offerID string) (CompPackage, error) {
	if err := a.ready(); err != nil {
		return CompPackage{}, err
	}
	return a.repo.DraftCounter(offerID)
}

// NewEstimate returns an unsaved estimate prefilled from the job's posted range and location.
func (a *App) NewEstimate(jobID string) (CompPackage, error) {
	if err := a.ready(); err != nil {
		return CompPackage{}, err
	}
	j, err := a.repo.GetJob(jobID)
	if err != nil {
		return CompPackage{}, err
	}
	s, err := a.settings.Load()
	if err != nil {
		return CompPackage{}, err
	}
	area, state := "", ""
	if md := a.market(); md != nil {
		area = md.GuessArea(j.Location)
		if area == "" {
			area = s.HomeAreaCode
		}
		state = md.Areas[area].State
		if area == "US" {
			state = md.Areas[s.HomeAreaCode].State
		}
		if state == "US" {
			state = ""
		}
	}
	return NewEstimateForJob(j, s.DefaultOccupation, area, state), nil
}

// PreviewComp evaluates an unsaved package for the editor's live preview.
func (a *App) PreviewComp(p CompPackage) (PackageResult, error) {
	if err := a.ready(); err != nil {
		return PackageResult{}, err
	}
	current, err := a.repo.CurrentCompPackage()
	if err != nil {
		return PackageResult{}, err
	}
	return a.evaluate(p, current)
}

func (a *App) SearchOccupations(q string) []Option {
	if md := a.market(); md != nil {
		return md.SearchOccupations(q)
	}
	return []Option{}
}

func (a *App) SearchAreas(q string) []Option {
	if md := a.market(); md != nil {
		return md.SearchAreas(q)
	}
	return []Option{}
}

// DescribeArea and DescribeOccupation give pickers the title for a saved code.
func (a *App) DescribeArea(code string) Option {
	if md := a.market(); md != nil {
		if ar, ok := md.Areas[code]; ok {
			title := ar.Title
			if ar.Type == "national" {
				title = "Remote / United States"
			}
			return Option{Code: code, Title: title, State: ar.State, Type: ar.Type}
		}
	}
	return Option{Code: code, Title: code}
}

func (a *App) DescribeOccupation(code string) Option {
	if md := a.market(); md != nil {
		if t, ok := md.Occupations[code]; ok {
			return Option{Code: code, Title: t}
		}
	}
	return Option{Code: code, Title: code}
}

func (a *App) MarketSources() DataSources {
	ds := DataSources{Tax: SourceInfo{
		Name:    "Income tax tables, tax year 2026",
		Release: "2026",
		URL:     "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/",
		Note:    "Federal: IRS Rev. Proc. 2025-32 and SSA. States: Tax Foundation 2026 table. Estimates only; credits and special rules are not modeled.",
	}}
	if md := a.market(); md != nil {
		ds.BLS, ds.BEA, ds.Built = md.Sources["bls"], md.Sources["bea"], md.Built
	}
	return ds
}

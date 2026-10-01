package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"path/filepath"
	"time"
)

type ScrapedJob struct {
	Company  string `json:"company"`
	Position string `json:"position"`
	URL      string `json:"url"`
	Site     string `json:"site"`
	Location string `json:"location"`
}

// App struct
type App struct {
	ctx           context.Context
	store         *Store
	settingsStore *SettingsStore
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		store:         NewStore(),
		settingsStore: NewSettingsStore(),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) GetApplications() ([]JobApplication, error) {
	return a.store.load()
}

func (a *App) AddApplication(app JobApplication) (JobApplication, error) {
	apps, err := a.store.load()
	if err != nil {
		return app, err
	}

	app.ID = generateID()
	app.UpdatedAt = time.Now()
	if app.DateApplied == "" {
		app.DateApplied = time.Now().Format("2006-01-02")
	}

	apps = append(apps, app)
	err = a.store.save(apps)
	return app, err
}

func (a *App) UpdateApplication(app JobApplication) (JobApplication, error) {
	apps, err := a.store.load()
	if err != nil {
		return app, err
	}

	for i, existingApp := range apps {
		if existingApp.ID == app.ID {
			app.UpdatedAt = time.Now()
			apps[i] = app
			err = a.store.save(apps)
			return app, err
		}
	}

	return app, errors.New("application not found")
}

func (a *App) DeleteApplication(id string) error {
	apps, err := a.store.load()
	if err != nil {
		return err
	}

	newApps := make([]JobApplication, 0)
	found := false
	for _, app := range apps {
		if app.ID == id {
			found = true
			continue
		}
		newApps = append(newApps, app)
	}

	if !found {
		return errors.New("application not found")
	}

	return a.store.save(newApps)
}

func (a *App) GetSettings() (Settings, error) {
	return a.settingsStore.Load()
}

func (a *App) SaveSettings(settings Settings) error {
	return a.settingsStore.Save(settings)
}

func (a *App) ScrapeJobs(searchTerm string, location string) ([]ScrapedJob, error) {
	cmd := exec.Command(filepath.Join("venv", "Scripts", "python.exe"), "scraper.py", searchTerm, location)
	var out bytes.Buffer
	cmd.Stdout = &out
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	
	err := cmd.Run()
	if err != nil {
		return nil, errors.New(stderr.String())
	}

	var result []ScrapedJob
	err = json.Unmarshal(out.Bytes(), &result)
	if err != nil {
		// Try to parse an error returned by python script
		var pyErr map[string]string
		if json.Unmarshal(out.Bytes(), &pyErr) == nil {
			if msg, ok := pyErr["error"]; ok {
				return nil, errors.New(msg)
			}
		}
		return nil, err
	}

	return result, nil
}

type AdzunaResponse struct {
	Results []struct {
		Title    string `json:"title"`
		Company  struct {
			DisplayName string `json:"display_name"`
		} `json:"company"`
		Location struct {
			DisplayName string `json:"display_name"`
		} `json:"location"`
		RedirectURL string `json:"redirect_url"`
	} `json:"results"`
}

func (a *App) AdzunaSearch(searchTerm string, location string) ([]ScrapedJob, error) {
	settings, err := a.settingsStore.Load()
	if err != nil {
		return nil, err
	}
	if settings.AdzunaAppID == "" || settings.AdzunaAppKey == "" {
		return nil, errors.New("Adzuna API credentials not configured")
	}

	reqURL := fmt.Sprintf("https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=%s&app_key=%s&results_per_page=10&what=%s&where=%s",
		url.QueryEscape(settings.AdzunaAppID),
		url.QueryEscape(settings.AdzunaAppKey),
		url.QueryEscape(searchTerm),
		url.QueryEscape(location),
	)

	resp, err := http.Get(reqURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Adzuna API error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var adzunaResp AdzunaResponse
	if err := json.NewDecoder(resp.Body).Decode(&adzunaResp); err != nil {
		return nil, err
	}

	var jobs []ScrapedJob
	for _, item := range adzunaResp.Results {
		jobs = append(jobs, ScrapedJob{
			Company:  item.Company.DisplayName,
			Position: item.Title,
			URL:      item.RedirectURL,
			Site:     "Adzuna",
			Location: item.Location.DisplayName,
		})
	}

	return jobs, nil
}

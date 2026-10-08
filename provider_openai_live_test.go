package main

import (
	"context"
	"os"
	"slices"
	"strings"
	"testing"
	"time"
)

// Live checks against real services. Skipped unless asked for:
//
//	JOBTRACK_LIVE_DEEPSEEK_KEY=sk-… go test -run TestLive -v
//	JOBTRACK_LIVE_OLLAMA_MODEL=llama3.2 go test -run TestLive -v   (Ollama running locally)
//
// Optional: JOBTRACK_LIVE_DEEPSEEK_MODEL picks the model (default: the first
// model DeepSeek lists). Each run prints model, time and the cache hit/miss
// log lines, which go in the spec's results.

func liveTasks() []aiTask {
	job := Job{Company: "Acme", Position: "Backend Engineer", Description: "Build and run Go APIs; on-call; mentor two juniors."}
	mi := MockInterview{Company: "Acme", Position: "Backend Engineer", Kind: "behavioral", Minutes: 10, Persona: "friendly", Transcript: []TranscriptLine{
		{Speaker: SpeakerInterviewer, Text: "Tell me about a time you handled a production outage.", AtMs: 0},
		{Speaker: SpeakerCandidate, Text: "Last year our payments API went down at 2am. I rolled back the deploy, then we found a missing index and added it. Downtime was 18 minutes.", AtMs: 4000},
		{Speaker: SpeakerInterviewer, Text: "What did you change afterwards?", AtMs: 30000},
		{Speaker: SpeakerCandidate, Text: "We added a migration check to CI and an alert on p99 latency.", AtMs: 33000},
	}}
	return []aiTask{
		nudgeTask("Tell me about a time you handled a production outage.", "We rolled back and added an index. Downtime was 18 minutes."),
		scorecardTask(job, mi, "Jane Doe. 5 years Go, Postgres, Kubernetes."),
		planTask(job, "Jane Doe. 5 years Go, Postgres, Kubernetes.", InterviewSetup{Kind: "behavioral", Minutes: 10, Persona: "friendly"}),
	}
}

func runLive(t *testing.T, providerID string, s Settings) {
	t.Helper()
	ctx := context.Background()
	for _, task := range liveTasks() {
		for run := 1; run <= 2; run++ { // the second run should hit DeepSeek's prefix cache
			if task.name != "nudge" && run == 2 {
				continue
			}
			start := time.Now()
			var plan InterviewPlan
			var out any = &map[string]any{}
			if task.name == "interviewPlan" {
				out = &plan
			}
			model, err := runAITask(ctx, s, providerID, task, out)
			if err != nil {
				t.Errorf("%s run %d: %v", task.name, run, err)
				continue
			}
			t.Logf("%s run %d: %s in %s", task.name, run, model, time.Since(start).Round(time.Millisecond))
			if task.name == "interviewPlan" {
				if err := plan.validate(10); err != nil {
					t.Errorf("plan fails the app's own checks: %v", err)
				}
			}
		}
	}
}

func TestLiveDeepSeek(t *testing.T) {
	key := os.Getenv("JOBTRACK_LIVE_DEEPSEEK_KEY")
	if key == "" {
		t.Skip("set JOBTRACK_LIVE_DEEPSEEK_KEY to run")
	}
	s := Settings{DeepSeekKey: key, DeepSeekModel: os.Getenv("JOBTRACK_LIVE_DEEPSEEK_MODEL")}
	models, err := listAIModels(context.Background(), providerDeepSeek, s)
	if err != nil {
		t.Fatalf("list models: %v", err)
	}
	t.Logf("DeepSeek models: %s", strings.Join(models, ", "))
	if s.DeepSeekModel == "" {
		s.DeepSeekModel = models[0]
	} else if !slices.Contains(models, s.DeepSeekModel) {
		t.Fatalf("%s is not in the list", s.DeepSeekModel)
	}
	runLive(t, providerDeepSeek, s)
	// The custom provider in plain mode, against the same real server.
	runLive(t, providerOpenAICompatible, Settings{CustomAIBaseURL: "https://api.deepseek.com/v1", CustomAIKey: key, CustomAIModel: s.DeepSeekModel, CustomAIMode: "plain"})
}

func TestLiveOllama(t *testing.T) {
	model := os.Getenv("JOBTRACK_LIVE_OLLAMA_MODEL")
	if model == "" {
		t.Skip("set JOBTRACK_LIVE_OLLAMA_MODEL to run (Ollama must be running)")
	}
	runLive(t, providerOllama, Settings{OllamaURL: defaultOllamaURL, OllamaModel: model})
}

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/anthropics/anthropic-sdk-go/shared/constant"
)

// anthropicProvider runs tasks on the Anthropic Messages API with structured
// outputs (output_config.format), so the answer always matches the schema.
type anthropicProvider struct{}

var (
	anthropicBaseURL    = "" // "" = the SDK default; tests point it at a fake server
	anthropicMaxRetries = 1  // one retry for transient errors; a long rate-limit wait is reported instead
	anthropicMaxTokens  = map[aiRole]int64{roleGrading: 16000, roleTips: 1024}
	// anthropicTimeout bounds a whole run (retries included); the SDK's own
	// per-attempt limit for large max_tokens is 10 minutes.
	anthropicTimeout = map[aiRole]time.Duration{roleGrading: 5 * time.Minute, roleTips: 60 * time.Second}
)

func (anthropicProvider) id() string    { return providerAnthropic }
func (anthropicProvider) label() string { return "Anthropic API" }

func (anthropicProvider) unavailable(s Settings) string {
	if s.AnthropicKey == "" {
		return "Add your Anthropic API key in Settings → AI"
	}
	return ""
}

func (anthropicProvider) run(ctx context.Context, s Settings, t aiTask) (aiResult, error) {
	opts := []option.RequestOption{option.WithAPIKey(s.AnthropicKey), option.WithMaxRetries(anthropicMaxRetries)}
	if anthropicBaseURL != "" {
		opts = append(opts, option.WithBaseURL(anthropicBaseURL))
	}
	client := anthropic.NewClient(opts...)
	timeout := anthropicTimeout[t.role]
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	effort := s.AnthropicGradingEffort
	if t.role == roleTips {
		effort = s.AnthropicTipsEffort
	}
	msg, err := client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     anthropic.Model(s.AnthropicModel),
		MaxTokens: anthropicMaxTokens[t.role],
		System:    []anthropic.BetaTextBlockParam{{Text: t.instruction}},
		Messages:  []anthropic.BetaMessageParam{anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(t.input))},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Effort: anthropic.BetaOutputConfigEffort(effort),
			Format: anthropic.BetaJSONOutputFormatParam{Schema: t.schema},
		},
		// If the model declines, Anthropic re-runs the request on a fallback model it picks.
		Fallbacks: anthropic.BetaFallbacksParamUnion{OfDefault: constant.ValueOf[constant.Default]()},
		Betas:     []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01},
	})
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return aiResult{}, fmt.Errorf("Anthropic took too long (over %s)", timeout)
	}
	if err != nil {
		return aiResult{}, anthropicError(err, s.AnthropicKey)
	}
	if msg.StopReason == anthropic.BetaStopReasonRefusal {
		return aiResult{}, errors.New("Anthropic declined to answer this request")
	}
	var text strings.Builder
	for _, block := range msg.Content {
		if block.Type == "text" {
			text.WriteString(block.Text)
		}
	}
	if !json.Valid([]byte(text.String())) {
		return aiResult{}, fmt.Errorf("Anthropic's answer wasn't valid JSON (stop reason %s)", msg.StopReason)
	}
	return aiResult{raw: json.RawMessage(text.String()), model: string(msg.Model)}, nil
}

// anthropicError turns an API error into a short, readable message without the key.
func anthropicError(err error, key string) error {
	var apiErr *anthropic.Error
	if !errors.As(err, &apiErr) {
		return fmt.Errorf("could not reach Anthropic: %s", hideKey(err.Error(), key))
	}
	switch status := apiErr.StatusCode; {
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return fmt.Errorf("Anthropic rejected the API key (%d). Check it in Settings.", status)
	case status == http.StatusTooManyRequests:
		if wait := apiErr.Response.Header.Get("retry-after"); wait != "" {
			return fmt.Errorf("Anthropic is rate-limiting requests; try again in %s s.", wait)
		}
		return errors.New("Anthropic is rate-limiting requests; try again shortly.")
	case status >= 500:
		return fmt.Errorf("Anthropic is temporarily unavailable (%d). Try again later.", status)
	default:
		return fmt.Errorf("Anthropic error %d: %s", status, truncate(hideKey(anthropicErrorMessage(apiErr), key), 300))
	}
}

// anthropicErrorMessage is the API's own explanation (error.message), e.g. an unknown model.
func anthropicErrorMessage(apiErr *anthropic.Error) string {
	var body struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal([]byte(apiErr.RawJSON()), &body) == nil && body.Error.Message != "" {
		return body.Error.Message
	}
	return http.StatusText(apiErr.StatusCode)
}

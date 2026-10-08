// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package ai

import (
	"context"
	"testing"

	"jobtrack/internal/settings"
)

func TestOpenAIJSONSchemaNotStrictWithOptionalFields(t *testing.T) {
	f, srv := newFakeOpenAI(t, chatReply("m1", `{}`))
	p, _ := providerByID(settings.ProviderOpenAICompatible)
	p.run(context.Background(), customSettings(srv, settings.ModeJSONSchema), testGradingTask())
	rf, _ := f.bodies[0]["response_format"].(map[string]any)
	js, _ := rf["json_schema"].(map[string]any)
	if rf["type"] != "json_schema" || js["schema"] == nil || js["strict"] == true {
		t.Fatalf("response_format = %v; want the schema sent without strict", rf)
	}
}

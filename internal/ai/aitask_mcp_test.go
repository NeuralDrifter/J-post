// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package ai

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

var testTaskSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"nudge": map[string]any{"type": "string"},
		"kind":  map[string]any{"type": "string", "enum": []any{"tip", "good"}},
	},
	"required":             []any{"nudge", "kind"},
	"additionalProperties": false,
}

// connectTaskMCP serves task in-process and returns a connected client session.
func connectTaskMCP(t *testing.T, task mcpTaskFile) *mcp.ClientSession {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	serverT, clientT := mcp.NewInMemoryTransports()
	server, err := newTaskMCPServer(task)
	if err != nil {
		t.Fatal(err)
	}
	go server.Run(ctx, serverT)
	cs, err := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "1"}, nil).Connect(ctx, clientT, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cs.Close() })
	return cs
}

func testTask(t *testing.T) mcpTaskFile {
	return mcpTaskFile{Instruction: "coach", Input: "Interviewer asked: X\nCandidate answered: Y", Schema: testTaskSchema,
		OutputPath: filepath.Join(t.TempDir(), "result.json")}
}

func TestTaskMCPListsTwoTools(t *testing.T) {
	cs := connectTaskMCP(t, testTask(t))
	res, err := cs.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]*mcp.Tool{}
	for _, tool := range res.Tools {
		names[tool.Name] = tool
	}
	if len(names) != 2 || names["get_input"] == nil || names["submit_result"] == nil {
		t.Fatalf("tools = %v", names)
	}
	var want, got any
	b, _ := json.Marshal(testTaskSchema)
	json.Unmarshal(b, &want)
	b, _ = json.Marshal(names["submit_result"].InputSchema)
	json.Unmarshal(b, &got)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("submit_result schema = %v, want the task schema", got)
	}
}

func TestTaskMCPGetInput(t *testing.T) {
	task := testTask(t)
	cs := connectTaskMCP(t, task)
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "get_input"})
	if err != nil || res.IsError || len(res.Content) != 1 {
		t.Fatalf("res = %+v, err = %v", res, err)
	}
	if text, ok := res.Content[0].(*mcp.TextContent); !ok || text.Text != task.Input {
		t.Fatalf("content = %#v", res.Content[0])
	}
}

func TestTaskMCPSubmitResultWritesOutput(t *testing.T) {
	task := testTask(t)
	cs := connectTaskMCP(t, task)
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "submit_result",
		Arguments: map[string]any{"nudge": "Lead with the result", "kind": "tip"}})
	if err != nil || res.IsError {
		t.Fatalf("res = %+v, err = %v", res, err)
	}
	raw, err := os.ReadFile(task.OutputPath)
	if err != nil {
		t.Fatal(err)
	}
	var n testNudge
	if err := json.Unmarshal(raw, &n); err != nil || n.Nudge != "Lead with the result" || n.Kind != "tip" {
		t.Fatalf("written = %s (%v)", raw, err)
	}
}

func TestTaskMCPRejectsInvalidResult(t *testing.T) {
	task := testTask(t)
	cs := connectTaskMCP(t, task)
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "submit_result",
		Arguments: map[string]any{"nudge": "missing kind"}})
	if err != nil {
		t.Fatal(err)
	}
	if !res.IsError {
		t.Fatal("a result missing a required field must be rejected")
	}
	if _, err := os.Stat(task.OutputPath); !os.IsNotExist(err) {
		t.Fatal("an invalid result must not be written")
	}
}

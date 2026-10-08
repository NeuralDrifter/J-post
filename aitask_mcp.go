// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// The MCP server headless Claude Code talks to during one AI task. Claude Code
// launches this executable with aiTaskMCPFlag and a task file, for that run
// only; it is never installed into the user's Claude Code configuration. It
// reads nothing but the task file and writes nothing but the output file.

const aiTaskMCPFlag = "--ai-task-mcp"

// mcpTaskFile is what the app hands the MCP server for one run.
type mcpTaskFile struct {
	Instruction string         `json:"instruction"`
	Input       string         `json:"input"`
	Schema      map[string]any `json:"schema"`     // the result's JSON Schema
	OutputPath  string         `json:"outputPath"` // where submit_result writes the result
}

// runAITaskMCP serves the task over in/out until the client closes the stream.
func runAITaskMCP(ctx context.Context, taskPath string, in io.Reader, out io.Writer) error {
	raw, err := os.ReadFile(taskPath)
	if err != nil {
		return err
	}
	var task mcpTaskFile
	if err := json.Unmarshal(raw, &task); err != nil {
		return fmt.Errorf("task file: %w", err)
	}
	server, err := newTaskMCPServer(task)
	if err != nil {
		return err
	}
	return server.Run(ctx, &mcp.IOTransport{Reader: io.NopCloser(in), Writer: nopWriteCloser{out}})
}

type nopWriteCloser struct{ io.Writer }

func (nopWriteCloser) Close() error { return nil }

// newTaskMCPServer exposes get_input and submit_result for one task.
func newTaskMCPServer(task mcpTaskFile) (*mcp.Server, error) {
	resolved, err := resolveSchema(task.Schema)
	if err != nil {
		return nil, fmt.Errorf("task schema: %w", err)
	}
	server := mcp.NewServer(&mcp.Implementation{Name: "jobtrack", Version: "1"}, nil)
	server.AddTool(&mcp.Tool{
		Name:        "get_input",
		Description: "Get the material to work on.",
		InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
	}, func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return textResult(task.Input, false), nil
	})
	server.AddTool(&mcp.Tool{
		Name:        "submit_result",
		Description: "Submit the finished result. Call this exactly once.",
		InputSchema: task.Schema,
	}, func(_ context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var result any
		if err := json.Unmarshal(req.Params.Arguments, &result); err != nil {
			return textResult("The result isn't valid JSON: "+err.Error(), true), nil
		}
		if err := resolved.Validate(result); err != nil {
			return textResult("The result doesn't match the required format: "+err.Error()+". Fix it and call submit_result again.", true), nil
		}
		if err := os.WriteFile(task.OutputPath, req.Params.Arguments, 0o600); err != nil {
			return nil, err
		}
		return textResult("Saved.", false), nil
	})
	return server, nil
}

func resolveSchema(schema map[string]any) (*jsonschema.Resolved, error) {
	raw, err := json.Marshal(schema)
	if err != nil {
		return nil, err
	}
	var s jsonschema.Schema
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, err
	}
	return s.Resolve(nil)
}

func textResult(text string, isError bool) *mcp.CallToolResult {
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}, IsError: isError}
}

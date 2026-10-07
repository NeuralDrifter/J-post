// fakeclaude stands in for the Claude Code CLI in provider tests. FAKE_MODE:
//   - ok: read the MCP config, find the task file, write a canned result to its
//     output path (as the real run does through submit_result), report success
//   - error: report an error result and exit 1 (e.g. not logged in)
//   - nosubmit: report success without writing a result
//   - sleep: hang past the provider's timeout
//   - version: print a version line
//
// FAKE_ARGS, when set, names a file that receives the argv as JSON.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

func main() {
	if path := os.Getenv("FAKE_ARGS"); path != "" {
		raw, _ := json.Marshal(os.Args[1:])
		os.WriteFile(path, raw, 0o600)
	}
	switch os.Getenv("FAKE_MODE") {
	case "version":
		fmt.Println("2.1.292 (Claude Code)")
	case "error":
		fmt.Println(`{"type":"result","is_error":true,"result":"Invalid API key · Please run /login"}`)
		os.Exit(1)
	case "nosubmit":
		fmt.Println(`{"type":"result","is_error":false,"result":"I could not decide."}`)
	case "sleep":
		time.Sleep(10 * time.Second)
	default:
		if err := submitCannedResult(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(2)
		}
		fmt.Println(`{"type":"result","is_error":false,"result":"done","modelUsage":{"claude-opus-5-5":{"inputTokens":1}}}`)
	}
}

func submitCannedResult() error {
	var mcpPath string
	for i, a := range os.Args {
		if a == "--mcp-config" && i+1 < len(os.Args) {
			mcpPath = os.Args[i+1]
		}
	}
	var cfg struct {
		MCPServers map[string]struct {
			Command string   `json:"command"`
			Args    []string `json:"args"`
		} `json:"mcpServers"`
	}
	raw, err := os.ReadFile(mcpPath)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return err
	}
	server := cfg.MCPServers["jobtrack"]
	if len(server.Args) != 2 {
		return fmt.Errorf("unexpected server args %v", server.Args)
	}
	var task struct {
		OutputPath string `json:"outputPath"`
	}
	raw, err = os.ReadFile(server.Args[1])
	if err != nil {
		return err
	}
	if err := json.Unmarshal(raw, &task); err != nil {
		return err
	}
	return os.WriteFile(task.OutputPath, []byte(`{"nudge":"From the fake","kind":"tip"}`), 0o600)
}

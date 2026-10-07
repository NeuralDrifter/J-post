package main

import (
	"fmt"
	"strings"
)

// The AI tasks used by mock interviews. Each schema is standard JSON Schema;
// providers that need another dialect convert it (see geminiSchema).

// nudgeTask asks for one short coaching cue about the answer just given.
func nudgeTask(question, answer string) aiTask {
	return aiTask{
		name:        "nudge",
		instruction: nudgeInstruction,
		input:       "Interviewer asked: " + question + "\nCandidate answered: " + answer,
		schema:      nudgeSchema,
		role:        roleTips,
	}
}

// scorecardTask asks for the full review of a finished mock interview.
func scorecardTask(job Job, mi MockInterview, resume string) aiTask {
	return aiTask{
		name:        "scorecard",
		instruction: scoringInstruction,
		input:       scoringPrompt(job, mi, resume),
		schema:      scorecardSchema,
		role:        roleGrading,
	}
}

var nudgeSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"nudge": map[string]any{"type": "string"},
		"kind":  map[string]any{"type": "string", "enum": []string{"tip", "good"}},
	},
	"required":             []string{"nudge", "kind"},
	"additionalProperties": false,
}

var scorecardSchema = func() map[string]any {
	str := map[string]any{"type": "string"}
	score := map[string]any{"type": "integer"}
	dims := []string{"communication", "structure", "relevance", "depth", "confidence"}
	overall := map[string]any{}
	for _, d := range dims {
		overall[d] = score
	}
	questionFields := []string{"question", "answerSummary", "worked", "improve", "strongerAnswer"}
	question := map[string]any{}
	for _, f := range questionFields {
		question[f] = str
	}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"overall": map[string]any{"type": "object", "properties": overall, "required": dims, "additionalProperties": false},
			"summary": str,
			"questions": map[string]any{"type": "array", "items": map[string]any{
				"type": "object", "properties": question, "required": questionFields, "additionalProperties": false,
			}},
			"practiceNext": map[string]any{"type": "array", "items": str},
		},
		"required":             []string{"overall", "summary", "questions", "practiceNext"},
		"additionalProperties": false,
	}
}()

const nudgeInstruction = "You are a discreet interview coach. Give ONE short cue (max 12 words) about the candidate's last answer: " +
	"either the single most useful improvement (kind: tip) or brief praise if it was strong (kind: good). No preamble."

const scoringInstruction = "You are an expert interview coach reviewing a mock interview. Score each dimension 1-5 (5 = excellent): " +
	"communication (clarity, concision), structure (STAR or similar), relevance (answers the question, fits the role), " +
	"depth (specifics, metrics, ownership), confidence (decisive, composed). For every interviewer question give a short " +
	"answer summary, what worked, what to improve and a stronger example answer written in the candidate's voice using " +
	"only facts from their answers and resume. End with exactly three things to practice next. Be candid and specific. " +
	"The transcript comes from a voice call with automatic turn detection. An interviewer line marked " +
	"[cut in while the candidate paused] means the interviewer started talking during a pause mid-answer and the " +
	"candidate carried on: treat the candidate's words before and after it as one answer, and don't count it as " +
	"interrupting or as speaking in fragments. A line marked [interrupted by the candidate] is a real interruption " +
	"and fair to critique. Fragmented or rambling speech within an answer is the candidate's own and also fair to critique."

// kindBriefName falls back to the raw id for sessions saved under a retired kind.
func kindBriefName(id string) string {
	if k, ok := findInterviewKind(id); ok {
		return k.briefName
	}
	return id
}

func scoringPrompt(job Job, mi MockInterview, resume string) string {
	return fmt.Sprintf("Role: %s at %s (%s interview, %s interviewer).\n\nJob description:\n%s\n\nCandidate's resume:\n%s\n\nTranscript:\n%s",
		job.Position, job.Company, kindBriefName(mi.Kind), mi.Persona, orDefault(job.Description, "(not provided)"),
		orDefault(resume, "(not provided)"), transcriptText(mi.Transcript))
}

// transcriptText renders the transcript as "Interviewer: …" / "Candidate: …"
// lines, joining consecutive lines from the same speaker (an answer split by a
// pause is still one answer).
func transcriptText(lines []TranscriptLine) string {
	var b strings.Builder
	for i, l := range lines {
		if i > 0 && lines[i-1].Speaker == l.Speaker {
			fmt.Fprintf(&b, " %s", l.Text)
			continue
		}
		if i > 0 {
			b.WriteString("\n")
		}
		who := "Interviewer"
		if l.Speaker == SpeakerCandidate {
			who = "Candidate"
		}
		fmt.Fprintf(&b, "%s: %s", who, l.Text)
		if l.CutOff != nil {
			fmt.Fprintf(&b, " %s", l.CutOff.label())
		}
	}
	if len(lines) > 0 {
		b.WriteString("\n")
	}
	return b.String()
}

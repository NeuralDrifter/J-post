// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"regexp"
	"strings"

	"golang.org/x/net/html"
)

var (
	blockTags     = map[string]bool{"p": true, "div": true, "section": true, "article": true, "ul": true, "ol": true, "table": true, "tr": true, "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true, "blockquote": true, "pre": true}
	skipTags      = map[string]bool{"script": true, "style": true, "head": true}
	manyNewlines  = regexp.MustCompile(`\n{3,}`)
	innerSpaceRun = regexp.MustCompile(`[ \t]+`)
)

// htmlToText turns API job descriptions (HTML) into plain, markdown-friendly
// text: paragraphs and headings become blank-line separated, list items "- ".
func htmlToText(s string) string {
	if !strings.Contains(s, "<") && !strings.Contains(s, "&") {
		return strings.TrimSpace(s)
	}
	z := html.NewTokenizer(strings.NewReader(s))
	var b strings.Builder
	skip := 0
	for {
		switch z.Next() {
		case html.ErrorToken:
			return tidyText(b.String())
		case html.TextToken:
			if skip == 0 {
				b.WriteString(strings.ReplaceAll(string(z.Text()), " ", " "))
			}
		case html.StartTagToken, html.SelfClosingTagToken:
			name, _ := z.TagName()
			tag := string(name)
			switch {
			case skipTags[tag]:
				skip++
			case tag == "li":
				b.WriteString("\n- ")
			case tag == "br":
				b.WriteString("\n")
			case blockTags[tag]:
				b.WriteString("\n\n")
			}
		case html.EndTagToken:
			name, _ := z.TagName()
			tag := string(name)
			if skipTags[tag] && skip > 0 {
				skip--
			} else if blockTags[tag] {
				b.WriteString("\n\n")
			}
		}
	}
}

func tidyText(s string) string {
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = strings.TrimSpace(innerSpaceRun.ReplaceAllString(l, " "))
	}
	return strings.TrimSpace(manyNewlines.ReplaceAllString(strings.Join(lines, "\n"), "\n\n"))
}

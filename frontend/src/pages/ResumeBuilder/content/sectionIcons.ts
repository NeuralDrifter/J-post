// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Award, BadgeCheck, BookOpen, Briefcase, FolderGit2, GraduationCap, HandHeart, Heart, Languages, Link2, Mail, MessageSquareQuote, ScrollText, Wrench, type LucideIcon } from 'lucide-react'
import type { CustomSectionType } from '@reactive-resume/schema/resume/data'

/** The builder's icon for each kind of section (the printed resume uses its own icons). */
export const SECTION_ICONS: Record<CustomSectionType, LucideIcon> = {
  summary: ScrollText,
  experience: Briefcase,
  education: GraduationCap,
  projects: FolderGit2,
  skills: Wrench,
  languages: Languages,
  interests: Heart,
  awards: Award,
  certifications: BadgeCheck,
  publications: BookOpen,
  volunteer: HandHeart,
  references: MessageSquareQuote,
  profiles: Link2,
  'cover-letter': Mail,
}

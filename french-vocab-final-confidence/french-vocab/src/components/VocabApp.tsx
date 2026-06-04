'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './VocabApp.module.css'

interface WordEntry {
  french: string
  english: string
  pos: string
  tags: string[]
  verified: boolean
  addedAt: number
}

interface TranslationResult {
  translation: string
  wordTranslations: Record<string, string>
  wordPos: Record<string, string>
  wordConfidence?: Record<string, number>
  original: string
}

const POS_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  noun:        { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe', label: 'noun' },
  verb:        { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0', label: 'verb' },
  adjective:   { bg: '#fef9c3', text: '#854d0e', border: '#fde68a', label: 'adj' },
  adverb:      { bg: '#f3e8ff', text: '#7e22ce', border: '#e9d5ff', label: 'adv' },
  pronoun:     { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa', label: 'pron' },
  conjunction: { bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8', label: 'conj' },
  preposition: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd', label: 'prep' },
  unknown:     { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0', label: '?' },
}

const ALL_POS = Object.keys(POS_COLORS).filter(k => k !== 'unknown')

export default function VocabApp() {
  const [tab, setTab] = useState<'translate' | 'bank' | 'browse'>('translate')
  const [input, setInput] = useState('')
  const [result, setResult] = useState<TranslationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [wordBank, setWordBank] = useState<WordEntry[]>([])
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set())
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [hoveredWord, setHoveredWord] = useState<string | null>(null)
  const [savingWord, setSavingWord] = useState<string | null>(null)
  const [editEntry, setEditEntry] = useState<WordEntry | null>(null)
  const [editMeaning, setEditMeaning] = useState('')
  const [editPos, setEditPos] = useState('unknown')
  const [editTags, setEditTags] = useState<string[]>([])
  const [editTagInput, setEditTagInput] = useState('')
  // Browse filters
  const [activePosFilters, setActivePosFilters] = useState<Set<string>>(new Set())
  const [expandedPos, setExpandedPos] = useState<string | null>(null)
  const [activeTagFilters, setActiveTagFilters] = useState<Set<string>>(new Set())

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('french-vocab-bank-v3')
    if (saved) {
      const bank: WordEntry[] = JSON.parse(saved)
      setWordBank(bank)
      setAddedWords(new Set(bank.map((w: WordEntry) => w.french.toLowerCase())))
    }
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node))
        setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && editEntry) setEditEntry(null) }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [editEntry])

  const saveToStorage = (bank: WordEntry[]) => localStorage.setItem('french-vocab-bank-v3', JSON.stringify(bank))

  const fetchSuggestions = useCallback(async (text: string) => {
    const lastWord = text.trim().split(/\s+/).pop() || ''
    if (lastWord.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    try {
      const res = await fetch(`/api/translate?word=${encodeURIComponent(lastWord)}&mode=suggest`)
      const data = await res.json()
      const suggs: string[] = data.suggestions || []
      setSuggestions(suggs); setShowSuggestions(suggs.length > 0); setActiveSuggestion(-1)
    } catch { setSuggestions([]) }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; setInput(val); setResult(null)
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    suggestTimer.current = setTimeout(() => fetchSuggestions(val), 250)
  }

  const handleSuggestionClick = (word: string) => {
    const parts = input.trim().split(/\s+/); parts[parts.length - 1] = word
    setInput(parts.join(' ')); setShowSuggestions(false); setSuggestions([]); setActiveSuggestion(-1)
    inputRef.current?.focus()
  }

  const highlightMatch = (word: string, query: string) => {
    const lastWord = query.trim().split(/\s+/).pop() || ''
    const idx = word.toLowerCase().indexOf(lastWord.toLowerCase())
    if (idx === -1 || !lastWord) return <span>{word}</span>
    return <span>{word.slice(0, idx)}<strong className={styles.matchBold}>{word.slice(idx, idx + lastWord.length)}</strong>{word.slice(idx + lastWord.length)}</span>
  }

  const doTranslate = async (text?: string) => {
    const query = (text || input).trim(); if (!query) return
    setLoading(true); setError(''); setResult(null); setShowSuggestions(false)
    try {
      const res = await fetch(`/api/translate?word=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
    } catch { setError('Translation failed. Please try again.') }
    finally { setLoading(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(i => Math.max(i - 1, -1)); return }
      if (e.key === 'Enter' && activeSuggestion >= 0) { e.preventDefault(); handleSuggestionClick(suggestions[activeSuggestion]); return }
    }
    if (e.key === 'Enter') { setShowSuggestions(false); doTranslate() }
    if (e.key === 'Escape') setShowSuggestions(false)
  }

  const validateAndAdd = async (french: string, english: string, pos: string) => {
    const clean = french.replace(/[^a-zA-ZÀ-ÿ'-]/g, '')
    if (!clean) return
    if (addedWords.has(clean.toLowerCase())) { removeWord(clean); return }
    setSavingWord(clean)
    // Save immediately — always. Verification just marks confidence.
    let verified = true
    try {
      const res = await fetch(`/api/translate?word=${encodeURIComponent(clean)}&mode=validate`)
      const data = await res.json()
      verified = !!(data.valid)
    } catch { verified = true }
    const entry: WordEntry = { french: clean, english, pos, tags: [], verified, addedAt: Date.now() }
    const newBank = [...wordBank, entry]
    setWordBank(newBank); setAddedWords(new Set([...addedWords, clean.toLowerCase()])); saveToStorage(newBank)
    setSavingWord(null)
    // No error shown — unverified words just get a tick button in the bank
  }

  const confirmWord = (french: string) => {
    const newBank = wordBank.map(w => w.french === french ? { ...w, verified: true } : w)
    setWordBank(newBank); saveToStorage(newBank)
  }

  const removeWord = (french: string) => {
    const clean = french.replace(/[^a-zA-ZÀ-ÿ'-]/g, '').toLowerCase()
    const newBank = wordBank.filter(w => w.french.toLowerCase() !== clean)
    const newAdded = new Set(addedWords); newAdded.delete(clean)
    setWordBank(newBank); setAddedWords(newAdded); saveToStorage(newBank)
  }

  const openEdit = (entry: WordEntry) => {
    setEditEntry(entry); setEditMeaning(entry.english)
    setEditPos(entry.pos); setEditTags([...entry.tags]); setEditTagInput('')
  }

  
  const openQuickAdd = (french: string, pos: string = 'unknown') => {
    setEditEntry({ french, english: '', pos, tags: [], verified: true, addedAt: Date.now() })
    setEditMeaning('')
    setEditPos(pos)
    setEditTags([])
    setEditTagInput('')
  }

const saveEdit = () => {
    if (!editEntry) return
    const exists = wordBank.some(w => w.french === editEntry.french)
    const newBank = exists
      ? wordBank.map(w => w.french === editEntry.french
          ? { ...w, english: editMeaning.trim() || w.english, pos: editPos, tags: editTags, verified: true } : w)
      : [...wordBank, { french: editEntry.french, english: editMeaning.trim(), pos: editPos, tags: editTags, verified: true, addedAt: Date.now() }]
    setWordBank(newBank)
    setAddedWords(new Set(newBank.map(w => w.french.toLowerCase())))
    saveToStorage(newBank)
    setEditEntry(null)
  }

  const addEditTag = () => {
    const t = editTagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !editTags.includes(t)) setEditTags([...editTags, t])
    setEditTagInput('')
  }

  const removeEditTag = (tag: string) => setEditTags(editTags.filter(t => t !== tag))

  const isWordSaved = (word: string) => addedWords.has(word.toLowerCase().replace(/[^a-zA-ZÀ-ÿ'-]/g, ''))

  // All unique tags in word bank
  const allTags = Array.from(new Set(wordBank.flatMap(w => w.tags))).sort()

  // Tags that belong to the expanded POS
  const tagsForExpandedPos = expandedPos
    ? Array.from(new Set(wordBank.filter(w => w.pos === expandedPos).flatMap(w => w.tags))).sort()
    : []

  // Filter logic
  const filteredBank = wordBank.filter(w => {
    const posMatch = activePosFilters.size === 0 || activePosFilters.has(w.pos)
    const tagMatch = activeTagFilters.size === 0 || w.tags.some(t => activeTagFilters.has(t))
    return posMatch && tagMatch
  })

  const grouped = filteredBank.reduce<Record<string, WordEntry[]>>((acc, w) => {
    const l = w.french[0].toUpperCase(); if (!acc[l]) acc[l] = []; acc[l].push(w); return acc
  }, {})
  const letters = Object.keys(grouped).sort()
  const pct = Math.min(100, Math.round((wordBank.length / 3000) * 100))
  const posCount = wordBank.reduce<Record<string, number>>((acc, w) => { acc[w.pos] = (acc[w.pos] || 0) + 1; return acc }, {})
  const tagCount = wordBank.reduce<Record<string, number>>((acc, w) => { w.tags.forEach(t => { acc[t] = (acc[t] || 0) + 1 }); return acc }, {})

  const renderHighlightedText = () => {
    if (!result) return null
    return result.original.split(/(\s+|[,\.!?;:«»""()\[\]])/).map((token, i) => {
      if (/^\s+$/.test(token)) return <span key={i}>{token}</span>
      if (/^[,\.!?;:«»""()\[\]]$/.test(token)) return <span key={i} className={styles.punct}>{token}</span>
      const clean = token.replace(/[^a-zA-ZÀ-ÿ'-]/g, '')
      if (!clean) return <span key={i}>{token}</span>
      const key = clean.toLowerCase()
      const trans = result.wordTranslations?.[key]
      const pos = result.wordPos?.[key] || 'unknown'
      const confidence = result.wordConfidence?.[key] ?? 0.5
      const posInfo = POS_COLORS[pos] || POS_COLORS.unknown
      const saved = isWordSaved(token)
      const isSaving = savingWord === clean
      const hasTranslation = trans && trans.toLowerCase() !== key
      const shouldColor = hasTranslation && pos !== 'unknown'
      return (
        <span key={i}
          className={`${styles.highlightWord} ${saved ? styles.saved : ''} ${isSaving ? styles.saving : ''} ${!hasTranslation ? styles.noTranslation : ''}`}
          style={!saved && shouldColor ? { background: posInfo.bg, color: posInfo.text } : {}}
          onMouseEnter={() => setHoveredWord(`${token}-${i}`)}
          onMouseLeave={() => setHoveredWord(null)}
          onClick={() => clean && (hasTranslation ? ((confidence > 0.95 && pos !== 'unknown') ? validateAndAdd(clean, trans, pos) : openQuickAdd(clean, pos)) : openQuickAdd(clean, pos))}
        >
          {token}
          {!saved && shouldColor && <span className={styles.posBadge} style={{ background: posInfo.bg, color: posInfo.text }}>{posInfo.label}</span>}
          {hoveredWord === `${token}-${i}` && (
            <span className={styles.inlineTooltip}>
              {isSaving ? 'Checking…' : saved ? `✓ ${trans || key} — click to remove` : hasTranslation ? `${trans}${pos !== 'unknown' ? ` · ${pos}` : ''} — click to save` : 'No translation — click to add/edit manually'}
            </span>
          )}
        </span>
      )
    })
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}><span>🇫🇷</span><span className={styles.logoText}>French Vocab</span></div>
          <nav className={styles.nav}>
            {(['translate', 'bank', 'browse'] as const).map(t => (
              <button key={t} className={`${styles.navBtn} ${tab === t ? styles.navActive : ''}`} onClick={() => setTab(t)}>
                {t === 'translate' ? 'Translate' : t === 'bank' ? 'Word bank' : 'Browse A–Z'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className={styles.main}>

        {/* ── TRANSLATE ── */}
        {tab === 'translate' && (
          <>
            <div className={styles.posLegend}>
              {Object.entries(POS_COLORS).filter(([k]) => k !== 'unknown').map(([k, v]) => (
                <span key={k} className={styles.posLegendItem} style={{ background: v.bg, color: v.text, border: `1px solid ${v.border}` }}>{v.label}</span>
              ))}
              <span className={styles.posLegendNote}>· Hover any word to see its translation</span>
            </div>
            <div className={styles.translateLayout}>
              <div className={styles.panel}>
                <div className={styles.panelLabel}>🇫🇷 French</div>
                <div className={styles.inputWrap}>
                  <input ref={inputRef} className={styles.searchInput} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} onFocus={() => suggestions.length > 0 && setShowSuggestions(true)} placeholder="Type a French word or sentence…" autoComplete="off" spellCheck={false} />
                  {input && <button className={styles.clearBtn} onClick={() => { setInput(''); setResult(null); setSuggestions([]); setShowSuggestions(false); inputRef.current?.focus() }}>✕</button>}
                  <button className={styles.searchBtn} onClick={() => doTranslate()} disabled={loading || !input.trim()}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  </button>
                  {showSuggestions && suggestions.length > 0 && (
                    <div ref={dropdownRef} className={styles.dropdown} role="listbox">
                      <div className={styles.dropdownHeader}>🇫🇷 French suggestions</div>
                      {suggestions.map((w, i) => (
                        <button key={i} className={`${styles.dropdownItem} ${activeSuggestion === i ? styles.dropdownActive : ''}`} onClick={() => handleSuggestionClick(w)}>
                          <span className={styles.dropdownWord}>{highlightMatch(w, input)}</span>
                          {isWordSaved(w) && <span className={styles.savedBadge}>saved</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className={styles.inputHint}>↑↓ navigate · Enter to translate</p>
              </div>
              <div className={styles.panel}>
                <div className={styles.panelLabel}>🇬🇧 English</div>
                {!result && !loading && !error && <div className={styles.placeholder}>Translation will appear here</div>}
                {loading && <div className={styles.placeholder}><span className={styles.spinner} /> Translating…</div>}
                {error && <div className={styles.errorMsg}>{error}</div>}
                {result && (
                  <>
                    <div className={styles.translationMain}>{result.translation}</div>
                    <div className={styles.divider} />
                    <div className={styles.highlightLabel}>Hover a word · click to save or remove</div>
                    <div className={styles.highlighted}>{renderHighlightedText()}</div>
                                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── WORD BANK ── */}
        {tab === 'bank' && (
          <div>
            <div className={styles.statsRow}>
              <div className={styles.statCard}><div className={styles.statNum}>{wordBank.length}</div><div className={styles.statLabel}>Words saved</div></div>
              <div className={styles.statCard} style={{ flex: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div className={styles.statLabel}>Progress toward 3,000 common French words</div>
                  <div className={styles.statNum} style={{ fontSize: 16 }}>{pct}%</div>
                </div>
                <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
              </div>
            </div>
            {wordBank.length === 0 ? <div className={styles.empty}>No words yet — translate something and click words to save them.</div> : (
              <div className={styles.wordList}>
                <div className={styles.wordListHeader}><span>French</span><span>English</span><span>Type</span><span>Tags</span><span></span></div>
                {[...wordBank].sort((a, b) => a.french.localeCompare(b.french)).map(w => {
                  const posInfo = POS_COLORS[w.pos] || POS_COLORS.unknown
                  return (
                    <div key={w.french} className={`${styles.wordRow} ${!w.verified ? styles.unverified : ''}`} title={!w.verified ? 'Unverified — click ✓ to confirm' : ''}>
                      <span className={styles.wordFr}>{w.french}</span>
                      <span className={styles.wordEn}>{w.english}</span>
                      <span className={styles.wordPos}>{<span className={styles.posPill} style={{ background: posInfo.bg, color: posInfo.text, border: `1px solid ${posInfo.border}` }}>{posInfo.label}</span>}</span>
                      <div className={styles.wordTags}>
                        {w.tags.map(t => <span key={t} className={styles.tagChip}>#{t}</span>)}
                        {w.tags.length === 0 && <span className={styles.noTags}>—</span>}
                      </div>
                      <div className={styles.wordActions}>
                        {!w.verified && (
                          <button className={styles.confirmBtn} onClick={() => confirmWord(w.french)} title="Confirm this is a real French word">✓</button>
                        )}
                        <button className={styles.editBtn} onClick={() => openEdit(w)} title="Edit">✎</button>
                        <button className={styles.removeBtn} onClick={() => removeWord(w.french)}>✕</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── BROWSE ── */}
        {tab === 'browse' && (
          <div className={styles.browseLayout}>
            <div className={styles.browseWords}>
              {wordBank.length === 0 ? <div className={styles.empty}>Your word bank is empty.</div>
                : filteredBank.length === 0 ? <div className={styles.empty}>No words match the selected filters.</div>
                : letters.map(letter => (
                  <div key={letter} className={styles.letterGroup}>
                    <div className={styles.letterHeader}>{letter}</div>
                    <div className={styles.pillsWrap}>
                      {grouped[letter].sort((a, b) => a.french.localeCompare(b.french)).map(w => {
                        const posInfo = POS_COLORS[w.pos] || POS_COLORS.unknown
                        const hasPos = w.pos !== 'unknown' && w.verified
                        return (
                          <div key={w.french} className={`${styles.pill} ${!w.verified ? styles.pillUnverified : ''}`} style={hasPos ? { background: posInfo.bg, borderColor: posInfo.border } : {}}>
                            <span className={styles.pillWord} style={hasPos ? { color: posInfo.text } : {}}>{w.french}</span>
                            <div className={styles.pillTooltip}>
                              <div className={styles.pillTooltipWord}>{w.english}</div>
                              {w.pos !== 'unknown' && <div className={styles.pillTooltipPos}>{w.pos}</div>}
                              {w.tags.length > 0 && <div className={styles.pillTooltipTags}>{w.tags.map(t => `#${t}`).join(' ')}</div>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
            </div>

            {/* Filter panel */}
            <div className={styles.filterPanel}>
              <div className={styles.filterPanelHeader}>
                <span className={styles.filterPanelTitle}>Filters</span>
                {(activePosFilters.size > 0 || activeTagFilters.size > 0) && (
                  <button className={styles.filterClearAll} onClick={() => { setActivePosFilters(new Set()); setActiveTagFilters(new Set()); setExpandedPos(null) }}>Clear all</button>
                )}
              </div>

              {/* POS section */}
              <div className={styles.filterSection}>
                <div className={styles.filterSectionTitle}>Part of speech</div>
                {ALL_POS.map(pos => {
                  const posInfo = POS_COLORS[pos]
                  const count = posCount[pos] || 0
                  const active = activePosFilters.has(pos)
                  const expanded = expandedPos === pos
                  const tagsForPos = Array.from(new Set(wordBank.filter(w => w.pos === pos).flatMap(w => w.tags))).sort()
                  return (
                    <div key={pos}>
                      <div className={styles.filterItemRow}>
                        <button
                          className={`${styles.filterItem} ${active ? styles.filterItemActive : ''}`}
                          style={active ? { background: posInfo.bg, color: posInfo.text, borderColor: posInfo.border } : {}}
                          onClick={() => {
                            const next = new Set(activePosFilters)
                            if (next.has(pos)) { next.delete(pos); if (expandedPos === pos) setExpandedPos(null) }
                            else { next.add(pos); setExpandedPos(pos) }
                            setActivePosFilters(next)
                          }}
                          disabled={count === 0}
                        >
                          <span className={styles.filterDot} style={{ background: posInfo.text }} />
                          <span className={styles.filterLabel}>{pos}</span>
                          <span className={styles.filterCount}>{count}</span>
                        </button>
                        {tagsForPos.length > 0 && (
                          <button
                            className={`${styles.filterExpandBtn} ${expanded ? styles.filterExpandBtnActive : ''}`}
                            onClick={() => setExpandedPos(expanded ? null : pos)}
                            title="Show tags"
                          >▾</button>
                        )}
                      </div>

                      {/* Subtags for this POS */}
                      {expanded && tagsForPos.length > 0 && (
                        <div className={styles.subTagList}>
                          {tagsForPos.map(tag => {
                            const tagActive = activeTagFilters.has(tag)
                            const tc = tagCount[tag] || 0
                            return (
                              <button
                                key={tag}
                                className={`${styles.subTagItem} ${tagActive ? styles.subTagActive : ''}`}
                                style={tagActive ? { background: posInfo.bg, color: posInfo.text, borderColor: posInfo.border } : {}}
                                onClick={() => {
                                  const next = new Set(activeTagFilters)
                                  if (next.has(tag)) next.delete(tag); else next.add(tag)
                                  setActiveTagFilters(next)
                                }}
                              >
                                <span>#{tag}</span>
                                <span className={styles.filterCount}>{tc}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* All tags section */}
              {allTags.length > 0 && (
                <div className={styles.filterSection}>
                  <div className={styles.filterSectionTitle}>All tags</div>
                  <div className={styles.allTagsList}>
                    {allTags.map(tag => {
                      const tagActive = activeTagFilters.has(tag)
                      return (
                        <button
                          key={tag}
                          className={`${styles.tagFilterChip} ${tagActive ? styles.tagFilterChipActive : ''}`}
                          onClick={() => {
                            const next = new Set(activeTagFilters)
                            if (next.has(tag)) next.delete(tag); else next.add(tag)
                            setActiveTagFilters(next)
                          }}
                        >#{tag}</button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className={styles.filterFooter}>
                {activePosFilters.size === 0 && activeTagFilters.size === 0
                  ? `Showing all ${wordBank.length} words`
                  : `Showing ${filteredBank.length} of ${wordBank.length}`}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── EDIT MODAL ── */}
      {editEntry && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setEditEntry(null)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Edit — <strong>{editEntry.french}</strong></span>
              <button className={styles.modalClose} onClick={() => setEditEntry(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.modalLabel}>English meaning</label>
              <input className={styles.modalInput} value={editMeaning} onChange={e => setEditMeaning(e.target.value)} placeholder="Enter correct translation…" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />

              <label className={styles.modalLabel} style={{ marginTop: 16 }}>Part of speech</label>
              <div className={styles.posGrid}>
                {Object.entries(POS_COLORS).filter(([k]) => k !== 'unknown').map(([k, v]) => (
                  <button key={k} className={`${styles.posOption} ${editPos === k ? styles.posSelected : ''}`} style={editPos === k ? { background: v.bg, color: v.text, borderColor: v.text } : {}} onClick={() => setEditPos(k)}>{k}</button>
                ))}
              </div>

              <label className={styles.modalLabel} style={{ marginTop: 16 }}>Tags</label>
              <div className={styles.tagInputRow}>
                <input
                  className={styles.modalInput}
                  value={editTagInput}
                  onChange={e => setEditTagInput(e.target.value)}
                  placeholder="Add a tag…"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEditTag() } }}
                  style={{ flex: 1 }}
                />
                <button className={styles.tagAddBtn} onClick={addEditTag} disabled={!editTagInput.trim()}>Add</button>
              </div>
              {editTags.length > 0 && (
                <div className={styles.editTagsList}>
                  {editTags.map(t => (
                    <span key={t} className={styles.editTagChip}>
                      #{t}
                      <button className={styles.editTagRemove} onClick={() => removeEditTag(t)}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <p className={styles.tagHint}>Tags help you group words — e.g. "travel", "food", "lesson-3"</p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancel} onClick={() => setEditEntry(null)}>Cancel</button>
              <button className={styles.modalSave} onClick={saveEdit}>Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

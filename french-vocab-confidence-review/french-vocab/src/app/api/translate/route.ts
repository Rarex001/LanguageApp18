const REVIEW_CONFIDENCE_THRESHOLD = 0.95;

async function lookupDictionaryPos(word: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/fr/${encodeURIComponent(word)}`)
    if (!r.ok) return null
    const data = await r.json()
    const pos = data?.[0]?.meanings?.[0]?.partOfSpeech
    const map: Record<string,string> = {
      noun:'noun', verb:'verb', adjective:'adjective', adverb:'adverb',
      pronoun:'pronoun', preposition:'preposition', conjunction:'conjunction'
    }
    return map[pos] || null
  } catch {
    return null
  }
}

import { NextRequest, NextResponse } from 'next/server'

function guessPosFromWord(word: string): string {
  // returns best guess only; UI should allow correction when uncertain
  const w = word.toLowerCase()
  if (['je','tu','il','elle','nous','vous','ils','elles','me','te','se','lui','leur','y','en','on','ce','cela','ça','qui','que','quoi','dont','où'].includes(w)) return 'pronoun'
  if (['de','du','des','à','au','aux','en','dans','sur','sous','par','pour','avec','sans','entre','vers','chez','contre','depuis','pendant','avant','après','devant','derrière','selon','sauf'].includes(w)) return 'preposition'
  if (['et','ou','mais','donc','or','ni','car','quand','comme','si','lorsque','puisque','parce','bien','alors','cependant','pourtant','néanmoins','toutefois'].includes(w)) return 'conjunction'
  if (['le','la','les','un','une','des','mon','ma','mes','ton','ta','tes','son','sa','ses','notre','nos','votre','vos','leur','leurs','ce','cet','cette','ces'].includes(w)) return 'determiner'
  if (/^(être|avoir|faire|aller|venir|voir|savoir|pouvoir|vouloir|devoir|dire|prendre|donner|trouver|partir|mettre|passer|sembler|rester|suivre|croire|tenir|parler|aimer|manger|finir|sortir|entrer|rentrer|tomber|naître|vivre|mourir|connaître|comprendre|attendre|répondre|perdre|sentir|servir|lire|écrire|courir|ouvrir|offrir|dormir|jouer|chercher)$/.test(w)) return 'verb'
  if (/(tion|sion|eur|rice|iste|isme|age|ure|ance|ence|tié|oir|oire)$/.test(w)) return 'noun'
  if (/(eux|euse|ais|aise|ien|ienne|if|ive|al|ale|el|elle|ique|able|ible|ant|ante)$/.test(w)) return 'adjective'
  if (/(er|ir|re|oir)$/.test(w) && w.length > 4) return 'verb'
  if (/ment$/.test(w) && w.length > 6) return 'adverb'
  return 'unknown'
}


// Common high-frequency nouns and substantives
const COMMON_NOUNS = new Set([
  'homme','femme','enfant','maison','temps','jour','année','personne','chose','monde',
  'vie','main','oeil','yeux','travail','pays','ville','eau','ami','amis','famille',
  'école','livre','voiture','chat','chien','argent','histoire','question','réponse'
])

function posConfidence(word: string, pos: string): boolean {
  const w = word.toLowerCase()
  if (COMMON_NOUNS.has(w)) return true
  if (pos === 'noun' && /(tion|sion|eur|euse|rice|age|isme|iste|ance|ence|té|ette|oir|oire)$/.test(w)) return true
  if (pos === 'verb' && /(er|ir|re)$/.test(w)) return true
  if (pos === 'adjective' && /(able|ible|ique|if|ive|eux|euse)$/.test(w)) return true
  return false
}


// Common French words that Datamuse often misses
const KNOWN_FRENCH_WORDS = new Set([
  'donc','or','ni','car','mais','cependant','pourtant','néanmoins','toutefois',
  'ainsi','aussi','alors','encore','déjà','jamais','toujours','souvent','parfois',
  'très','trop','peu','beaucoup','assez','plutôt','vraiment','bien','mal','vite',
  'ici','là','où','quand','comment','pourquoi','combien','que','qui','quoi','dont',
  'je','tu','il','elle','nous','vous','ils','elles','on','me','te','se','lui','leur',
  'le','la','les','un','une','des','du','de','à','au','aux','en','dans','sur','sous',
  'par','pour','avec','sans','entre','vers','chez','ce','cet','cette','ces',
  'mon','ma','mes','ton','ta','tes','son','sa','ses','notre','nos','votre','vos',
  'être','avoir','faire','aller','venir','voir','savoir','pouvoir','vouloir','devoir',
  'dire','prendre','donner','trouver','partir','mettre','passer','rester','croire',
  'non','oui','si','ne','pas','plus','rien','personne','tout','tous','toute','toutes',
])

export async function GET(req: NextRequest) {
  const word = req.nextUrl.searchParams.get('word')
  const mode = req.nextUrl.searchParams.get('mode') || 'translate'
  if (!word) return NextResponse.json({ error: 'No word provided' }, { status: 400 })

  if (mode === 'suggest') {
    try {
      const lastWord = word.trim().split(/\s+/).pop() || ''
      const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(lastWord)}*&v=fr&max=8`)
      const words: { word: string }[] = await res.json()
      return NextResponse.json({ suggestions: words.map(w => w.word) })
    } catch { return NextResponse.json({ suggestions: [] }) }
  }

  if (mode === 'validate') {
    const clean = word.toLowerCase().trim()
    // Check our known words list first
    if (KNOWN_FRENCH_WORDS.has(clean)) return NextResponse.json({ valid: true, confident: true })
    // Check if POS detection recognizes it (not unknown = likely French)
    const pos = guessPosFromWord(clean)
    if (pos !== 'unknown') return NextResponse.json({ valid: true, confident: true })
    // Fall back to Datamuse
    try {
      const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&v=fr&max=10`)
      const words: { word: string }[] = await res.json()
      const valid = words.some(w => w.word.toLowerCase() === clean)
      return NextResponse.json({ valid, confident: valid })
    } catch { return NextResponse.json({ valid: false, confident: false }) }
  }

  try {
    const sentenceRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=fr|en`)
    const sentenceData = await sentenceRes.json()
    const translation = sentenceData.responseData?.translatedText || ''
    const tokens = word.trim().split(/\s+/)
    const wordTranslations: Record<string, string> = {}
    const wordPos: Record<string, string> = {}

    if (tokens.length > 1) {
      await Promise.all(tokens.map(async (token) => {
        const clean = token.replace(/[^a-zA-ZÀ-ÿ'-]/g, '')
        if (!clean) return
        const key = clean.toLowerCase()
        const dictPos = await lookupDictionaryPos(clean)
        const guessedPos = guessPosFromWord(clean)
        wordPos[key] = dictPos || (posConfidence(clean, guessedPos) ? guessedPos : 'unknown')
        try {
          const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=fr|en`)
          const d = await r.json()
          const tr = d.responseData?.translatedText || ''
          wordTranslations[key] = (tr && tr.toLowerCase() !== key) ? tr : clean
        } catch { wordTranslations[key] = clean }
      }))
    } else {
      const clean = word.toLowerCase().replace(/[^a-zA-ZÀ-ÿ'-]/g, '')
      wordTranslations[clean] = translation
      const dictPos = await lookupDictionaryPos(clean)
      const guessedPos = guessPosFromWord(clean)
      wordPos[clean] = dictPos || (posConfidence(clean, guessedPos) ? guessedPos : 'unknown')
    }
    return NextResponse.json({ translation, wordTranslations, wordPos, original: word })
  } catch { return NextResponse.json({ error: 'Translation failed' }, { status: 500 }) }
}

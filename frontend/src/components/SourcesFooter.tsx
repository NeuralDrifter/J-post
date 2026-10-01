import { BrowserOpenURL } from '../lib/backend'
import { SOURCE_NUMBER, useSources, type SourceKey } from '../lib/sources'

/** Numbered list of the datasets behind every ✦ on the page. */
export function SourcesFooter({ used = ['bls', 'bea', 'tax'] }: { used?: SourceKey[] }) {
  const sources = useSources()
  if (!sources) return null
  return (
    <footer className="border-t border-line pt-3 font-mono text-[10px] leading-relaxed text-ink-3">
      <p className="mb-1 tracking-wider uppercase">Sources</p>
      <ol className="space-y-0.5">
        {used.map((key) => {
          const s = sources[key]
          return (
            <li key={key}>
              ✦{SOURCE_NUMBER[key]}{' '}
              <button className="underline-offset-2 hover:text-ink-2 hover:underline" onClick={() => BrowserOpenURL(s.url)}>
                {s.name}
              </button>
              {s.release && `, ${s.release}`}. {s.note}
            </li>
          )
        })}
      </ol>
      <p className="mt-1.5">Estimates, not tax or financial advice.</p>
    </footer>
  )
}

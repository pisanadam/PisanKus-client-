/**
 * Every translation table, registered in one place.
 *
 * The tables are small enough (147 lines each) that loading them all costs less
 * than the machinery needed to load one on demand, and it keeps a language
 * switch instant.
 */
import { registerDictionaries } from './index'
import ar from './ar'
import az from './az'
import de from './de'
import en from './en'
import es from './es'
import fa from './fa'
import fr from './fr'
import it from './it'
import ja from './ja'
import kk from './kk'
import ko from './ko'
import ky from './ky'
import ru from './ru'
import tk from './tk'
import uz from './uz'
import zh from './zh'

registerDictionaries({ ar, az, de, en, es, fa, fr, it, ja, kk, ko, ky, ru, tk, uz, zh })

export {}

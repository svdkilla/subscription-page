import { TSubscriptionPageLanguageCode } from '@remnawave/subscription-page-types'

import { TSubscriptionPageConfig } from '@shared/utils/custom-links'

export interface IState {
    config: null | TSubscriptionPageConfig
    currentLang: TSubscriptionPageLanguageCode
    isConfigLoaded: boolean
}

import { TSubscriptionPageLanguageCode } from '@remnawave/subscription-page-types'

import { TSubscriptionPageConfig } from '@shared/utils/custom-links'

import { IState } from './state.interface'

export interface IActions {
    actions: {
        getInitialState: () => IState
        resetState: () => Promise<void>
        setConfig: (config: TSubscriptionPageConfig) => void
        setLanguage: (lang: TSubscriptionPageLanguageCode) => void
    }
}

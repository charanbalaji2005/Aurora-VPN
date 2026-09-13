import React, {createContext, useContext, useMemo} from 'react';
import {useColorScheme, useWindowDimensions} from 'react-native';
import {
  AuroraColors,
  Dimens,
  Typography,
  darkColors,
  dimensFor,
  lightColors,
  typography,
} from './tokens';

type Theme = {colors: AuroraColors; dimens: Dimens; type: Typography};

const ThemeContext = createContext<Theme | null>(null);

/**
 * One theme for the whole tree, resolved from the live window size.
 *
 * Recomputing on every dimension change is what makes the app correct on a
 * foldable and in split-screen, not just at the two sizes someone remembered
 * to test.
 */
export function ThemeProvider({children}: {children: React.ReactNode}) {
  const scheme = useColorScheme();
  const {width} = useWindowDimensions();

  const value = useMemo<Theme>(() => {
    const dimens = dimensFor(width);
    return {
      colors: scheme === 'light' ? lightColors : darkColors,
      dimens,
      type: typography(dimens.typeScale),
    };
  }, [scheme, width]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return theme;
}

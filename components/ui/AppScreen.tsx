import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type ViewProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/constants';

interface AppScreenBaseProps {
  /**
   * Horizontal screen padding. Defaults to Spacing.screenH (20).
   * Pass 0 or false to disable padding.
   */
  horizontalPadding?: number | false;
  /**
   * Background color override.
   */
  backgroundColor?: string;
  /**
   * Additional bottom padding (e.g. for a fixed footer button).
   */
  bottomPadding?: number;
}

interface AppScreenScrollProps extends AppScreenBaseProps, Omit<ScrollViewProps, 'style' | 'contentContainerStyle'> {
  scroll: true;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardAvoiding?: boolean;
  /**
   * Passed to KeyboardAvoidingView. Defaults to safe-area top on iOS when avoiding keyboard.
   */
  keyboardVerticalOffset?: number;
}

interface AppScreenFlatProps extends AppScreenBaseProps, ViewProps {
  scroll?: false;
}

type AppScreenProps = AppScreenScrollProps | AppScreenFlatProps;

export function AppScreen(props: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    horizontalPadding = Spacing.screenH,
    backgroundColor = Colors.background,
    bottomPadding = 0,
  } = props;

  const hPad = horizontalPadding === false ? 0 : horizontalPadding;

  const sharedStyle: ViewStyle = {
    backgroundColor,
    paddingTop: insets.top,
  };

  if (props.scroll) {
    const {
      scroll,
      contentStyle,
      keyboardAvoiding = true,
      keyboardVerticalOffset,
      children,
      ...rest
    } = props as AppScreenScrollProps;

    const kOffset =
      keyboardVerticalOffset ??
      (Platform.OS === 'ios' ? insets.top : 0);

    const scrollContent = (
      <ScrollView
        {...rest}
        showsVerticalScrollIndicator={false}
        style={[styles.flex, sharedStyle]}
        contentContainerStyle={[
          {
            paddingHorizontal: hPad,
            paddingBottom: insets.bottom + Spacing.xl + bottomPadding,
            flexGrow: 1,
          },
          contentStyle,
        ]}
      >
        {children}
      </ScrollView>
    );

    if (keyboardAvoiding) {
      return (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={kOffset}
        >
          {scrollContent}
        </KeyboardAvoidingView>
      );
    }

    return scrollContent;
  }

  const { children, style, ...rest } = props as AppScreenFlatProps;

  return (
    <View
      style={[
        styles.flex,
        sharedStyle,
        {
          paddingHorizontal: hPad,
          paddingBottom: insets.bottom + bottomPadding,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});

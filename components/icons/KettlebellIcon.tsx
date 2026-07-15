import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
  badge?: boolean;
  badgeColor?: string;
  /** Outline stroke weight (viewBox units). Default 0.9; the glass header passes a
   *  bolder value so the kettlebell reads at the same weight as the solid VF mark. */
  strokeWidth?: number;
}

export function KettlebellIcon({ size = 30, color = '#ffffff', badge = false, badgeColor = '#24ac88', strokeWidth = 0.9 }: Props) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M16.2 10.7L16.8 8.3C16.9 8 17.3 6.6 16.5 5.4C15.9 4.5 14.7 4 13 4H11C9.3 4 8.1 4.5 7.5 5.4C6.7 6.6 7.1 7.9 7.2 8.3L7.8 10.7C6.7 11.8 6 13.3 6 15C6 17.1 7.1 18.9 8.7 20H15.3C16.9 18.9 18 17.1 18 15C18 13.3 17.3 11.8 16.2 10.7M9.6 9.5L9.1 7.8V7.7C9.1 7.7 8.9 7 9.2 6.6C9.4 6.2 10 6 11 6H13C13.9 6 14.6 6.2 14.9 6.5C15.2 6.9 15 7.6 15 7.6L14.5 9.5C13.7 9.2 12.9 9 12 9C11.1 9 10.3 9.2 9.6 9.5Z"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
      {badge && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: badgeColor,
          }}
        />
      )}
    </View>
  );
}

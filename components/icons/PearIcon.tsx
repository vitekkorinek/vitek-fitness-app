import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
  badge?: boolean;
  badgeColor?: string;
  strokeWidth?: number;
}

export function PearIcon({ size = 30, color = '#ffffff', badge = false, badgeColor = '#24ac88', strokeWidth = 1.0 }: Props) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M18 16C18 19.31 15.31 22 12 22C8.69 22 6 19.31 6 16C6 13 8 13 8 10C8 8.56 8.75 7.22 10 6.5C10.4 6.27 10.82 6.12 11.25 6.04V5C11.25 4.63 11.17 4.42 11.03 4.28C10.9 4.14 10.63 4 10 4V2.5C10.88 2.5 11.6 2.73 12.09 3.22C12.58 3.71 12.75 4.38 12.75 5V6.04C13.18 6.12 13.61 6.27 14 6.5C15.25 7.22 16 8.56 16 10C16 13 18 13 18 16Z"
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

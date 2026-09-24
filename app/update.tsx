import React from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'

import { GlassSurface } from '@/components/Glass'
import { IconButton } from '@/components/Button'
import { Body, SectionTitle } from '@/components/Text'
import { UpdatePanel } from '@/components/UpdatePanel'
import { useAvailableUpdate } from '@/hooks/useAvailableUpdate'
import { useTheme } from '@/theme/useTheme'
import { spacing } from '@/theme/tokens'

const HAIRLINE = StyleSheet.hairlineWidth * 2

/**
 * Update, opened from the icon on Today's header.
 *
 * A sheet of its own rather than a jump to Profile: the version section there is collapsed,
 * near the bottom of a long list, and a tab switch cannot reliably open and scroll to it. The
 * icon promises "there is an update", so the thing it opens has to be the install button.
 */
export default function UpdateScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const available = useAvailableUpdate()

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <GlassSurface
        radius={0}
        bordered={false}
        style={{
          paddingTop: insets.top,
          borderBottomWidth: HAIRLINE,
          borderBottomColor: theme.glass.border,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
          }}
        >
          <IconButton
            accessibilityLabel="Close update"
            onPress={() => router.back()}
            style={{ marginLeft: -spacing.md }}
          >
            <X size={22} color={theme.text} strokeWidth={2} />
          </IconButton>
          <View style={{ flex: 1 }}>
            <SectionTitle>Update available</SectionTitle>
            {available ? (
              <Body size={12} tone="muted" numberOfLines={1}>
                Version {available.version}
              </Body>
            ) : null}
          </View>
        </View>
      </GlassSurface>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        {/* Keyed on the version: opened from the notification on a cold start, the check has
            not finished at first render, and the panel reads `initial` only once. */}
        <UpdatePanel key={available?.version ?? 'none'} initial={available} />
      </ScrollView>
    </View>
  )
}

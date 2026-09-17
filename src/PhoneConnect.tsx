import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { isFirebaseConfigured, siteUrl } from './config';
import { hubUrl } from './connect';
import { shareBase, useLanInfo } from './share';
import { colors } from './theme';
import { Button, Card, Fold } from './ui';

const EXPO_LOCAL = 'http://localhost:8081';

export function PhoneConnect() {
  const info = useLanInfo();
  const [copied, setCopied] = useState('');

  const lanExpo = (info?.phone || []).find((url) => /:\d+$/.test(url) && !url.includes('localhost')) || '';
  const hub = info?.hub?.[0] || hubUrl();
  const pub = shareBase(info, siteUrl);

  async function copy(text: string, label: string) {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 1600);
  }

  return (
    <Card>
      <Fold title="접속 주소">
      <Text style={{ color: colors.muted, lineHeight: 22, marginBottom: 10 }}>
        {isFirebaseConfigured
          ? '클라우드에 연결되어 있습니다. 맥이 꺼져 있거나 다른 와이파이여도 강사 로그인만 하면 달력·설정·레슨생 상세를 어디서든 수정할 수 있습니다.'
          : '강사 로그인만 있으면 달력·설정·레슨생 상세는 맥 전원·와이파이와 관계없이 이 기기에서 수정됩니다. 아래 공개 주소는 다른 폰에서 처음 열 때와 레슨생 입장용입니다.'}
      </Text>
      <Text style={{ color: colors.muted, fontWeight: '700' }}>강사 웹 로그인</Text>
      {pub ? (
        <>
          <Text selectable style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 4 }}>
            {pub}/teach
          </Text>
          <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 22 }}>
            다른 폰이나 맥이 꺼진 뒤에도 이름과 비밀번호로 강사 화면을 엽니다.
          </Text>
          <Button label={copied === 'teach' ? '복사됨' : '강사 로그인 주소 복사'} onPress={() => copy(`${pub}/teach`, 'teach')} />
          <Text style={{ color: colors.muted, fontWeight: '700', marginTop: 16 }}>레슨생 웹 로그인</Text>
          <Text selectable style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 4 }}>
            {pub}/enter
          </Text>
          <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 22 }}>
            맥이 꺼져 있거나 다른 와이파이여도 이름과 가입코드만 입력하면 레슨생 기능을 쓸 수 있습니다. 한 명에게는 {pub}/j/가입코드 를 보내면 코드가 채워집니다.
          </Text>
          <Button label={copied === 'enter' ? '복사됨' : '레슨생 로그인 주소 복사'} onPress={() => copy(`${pub}/enter`, 'enter')} />
          <Button
            tone="ghost"
            label={copied === 'join' ? '복사됨' : '가입코드 자리 링크 복사'}
            onPress={() => copy(`${pub}/j/가입코드`, 'join')}
          />
          <Button tone="ghost" label={copied === 'public' ? '복사됨' : '사이트 주소 복사'} onPress={() => copy(pub, 'public')} />
        </>
      ) : (
        <Text style={{ color: colors.wine, fontWeight: '700', marginTop: 6, lineHeight: 22 }}>
          공개 링크를 준비하는 중입니다. 허브를 켠 뒤 약 10초만 기다려 주세요.
        </Text>
      )}
      <Text style={{ color: colors.muted, fontWeight: '700', marginTop: 16 }}>맥 브라우저</Text>
      <Text selectable style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 4 }}>
        {EXPO_LOCAL}
      </Text>
      <Button label={copied === 'local' ? '복사됨' : '맥 주소 복사'} onPress={() => copy(EXPO_LOCAL, 'local')} />
      {lanExpo ? (
        <>
          <Text style={{ color: colors.muted, fontWeight: '700', marginTop: 12 }}>아이폰 Safari</Text>
          <Text selectable style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 4 }}>
            {lanExpo}
          </Text>
          <Button label={copied === 'phone' ? '복사됨' : '아이폰 주소 복사'} onPress={() => copy(lanExpo, 'phone')} />
          <Image
            accessibilityLabel="아이폰 접속 QR"
            source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(lanExpo)}` }}
            style={{ width: 180, height: 180, alignSelf: 'center', marginVertical: 12, backgroundColor: '#fff' }}
          />
        </>
      ) : (
        <Text style={{ color: colors.wine, fontWeight: '700', marginTop: 10 }}>
          아이폰용 LAN 주소를 아직 못 찾았습니다. 맥에서 `npm run hub` 와 Expo(8081)를 켜 주세요.
        </Text>
      )}
      <Text style={{ color: colors.muted, fontWeight: '700', marginTop: 12 }}>폰 앱 허브 주소</Text>
      <Text selectable style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 4 }}>
        {hub}
      </Text>
      <Button label={copied === 'hub' ? '복사됨' : '허브 주소 복사'} onPress={() => copy(hub, 'hub')} />
      {info?.lan?.length ? (
        <View style={{ marginTop: 8 }}>
          {info.lan.map((ip) => (
            <Text key={ip} style={{ color: colors.muted }}>
              맥 IP {ip}
            </Text>
          ))}
        </View>
      ) : null}
      </Fold>
    </Card>
  );
}

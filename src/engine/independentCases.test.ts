import { describe, expect, it } from 'vitest';
import { checkQuestionAnswer, checkStudentStep } from './calcVerifiers';
import { answersEquivalent } from './verify';

// 预期值全部由测试内的直接算术或手算常量给出，不经过被测解析器。

describe('成组用例：kf(a) 与 k*f(a)', () => {
  for (const k of [2, 3, 5, 7]) {
    for (const a of [1, 2, 4, 5]) {
      // f(x)=3x-1
      const expected = k * (3 * a - 1);

      it(`f(x)=3x-1，求 ${k}f(${a}) 与 ${k}*f(${a}) 都是 ${expected}`, () => {
        for (const expression of [`${k}f(${a})`, `${k}*f(${a})`]) {
          const question = `已知 f(x)=3x-1，求 ${expression}`;
          expect(checkQuestionAnswer(question, [], String(expected)))
            .toMatchObject({ status: 'verified', expected: String(expected) });
          expect(checkQuestionAnswer(question, [], String(expected + 1)).status).toBe('conflict');
        }
      });
    }
  }
});

describe('成组用例：相邻分数之积', () => {
  for (const [p, q] of [[1, 2], [2, 3], [3, 4], [5, 7], [2, 7], [4, 9]]) {
    it(`\\frac{1}{${p}}\\frac{1}{${q}} 等于 1/${p * q}`, () => {
      const product = `\\frac{1}{${p}}\\frac{1}{${q}}`;
      expect(answersEquivalent(product, `1/${p * q}`)).toBe(true);
      // 把相邻数字拼接起来得到的另一个数，必须不等价。
      expect(answersEquivalent(product, `1/${String(p)}${q}`)).toBe(false);
    });
  }
});

describe('成组用例：同一方程改变整体倍数', () => {
  for (const m of ['1', '2', '3', '0.00001', '100000', '-1', '0.5', '7']) {
    it(`两边同乘 ${m} 后解集仍是 x=2或x=3`, () => {
      const question = `解方程 ${m}(x²-5x+6)=0`;
      expect(checkQuestionAnswer(question, [], 'x=2或x=3'))
        .toMatchObject({ status: 'verified', expected: 'x=2或x=3' });
      expect(checkQuestionAnswer(question, [], 'x=2').status).toBe('conflict');
    });
  }

  for (const m of ['1', '0.00001', '100000', '-3']) {
    it(`两边同乘 ${m}：无实根与重根的结论不变`, () => {
      expect(checkQuestionAnswer(`解方程 ${m}(x²+1)=0`, [], '无实数解'))
        .toMatchObject({ status: 'verified', expected: '无实数解' });
      expect(checkQuestionAnswer(`解方程 ${m}(x²+1)=0`, [], 'x=1').status).toBe('conflict');
      expect(checkQuestionAnswer(`解方程 ${m}(x-1)²=0`, [], 'x=1'))
        .toMatchObject({ status: 'verified', expected: 'x=1' });
    });
  }
});

describe('成组用例：同一步骤只改变空格', () => {
  const spacings = [
    (body: string) => `(2)+3=${body}`,
    (body: string) => `(2) +3=${body}`,
    (body: string) => `(2)+ 3=${body}`,
    (body: string) => `(2) + 3=${body}`,
    (body: string) => `(2)　+　3=${body}`,
    (body: string) => `(2)　+3 =${body}`,
  ];

  for (const write of spacings) {
    it(`${write('5')} 成立`, () => {
      expect(checkStudentStep('', write('5')).status).toBe('consistent');
    });

    it(`${write('3')} 不成立`, () => {
      expect(checkStudentStep('', write('3')).status).toBe('inconsistent');
    });
  }

  const labels = [
    (body: string) => `1. 1.5+2=${body}`,
    (body: string) => `1.  1.5+2=${body}`,
    (body: string) => `1、1.5+2=${body}`,
    (body: string) => `1 、 1.5+2=${body}`,
    (body: string) => `1) 1.5+2=${body}`,
  ];

  for (const write of labels) {
    it(`带编号 ${write('3.5')} 成立，${write('7')} 不成立`, () => {
      expect(checkStudentStep('', write('3.5')).status).toBe('consistent');
      expect(checkStudentStep('', write('7')).status).toBe('inconsistent');
    });
  }
});

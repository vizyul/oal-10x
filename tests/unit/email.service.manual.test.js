const emailService = require('../../src/services/email.service');

describe('EmailService Generator Methods', () => {
  const mockData = {
    amount: '99.00',
    invoiceUrl: 'https://stripe.com/invoice/123',
    isActive: true,
    firstName: 'TestUser'
  };

  test('generatePaymentFailedEmailHTML should return string', () => {
    const html = emailService.generatePaymentFailedEmailHTML(mockData);
    expect(typeof html).toBe('string');
    expect(html).toContain('Payment Method Failed');
    expect(html).toContain('99.00');
    expect(html).toContain('https://stripe.com/invoice/123');
  });

  test('generatePaymentFailedEmailText should return string', () => {
    const text = emailService.generatePaymentFailedEmailText(mockData);
    expect(typeof text).toBe('string');
    expect(text).toContain('Payment Failed');
    expect(text).toContain('99.00');
  });

  test('generateTrialEndedEmailHTML should return string (Active)', () => {
    const html = emailService.generateTrialEndedEmailHTML({ ...mockData, isActive: true });
    expect(html).toContain('Trial Has Ended');
    expect(html).toContain('subscription is now active');
  });

  test('generateTrialEndedEmailHTML should return string (Expired)', () => {
    const html = emailService.generateTrialEndedEmailHTML({ ...mockData, isActive: false });
    expect(html).toContain('Trial Expired');
    expect(html).toContain('upgrade your subscription');
  });

  test('generatePaymentActionRequiredEmailHTML should return string', () => {
    const html = emailService.generatePaymentActionRequiredEmailHTML(mockData);
    expect(html).toContain('Verify Your Payment');
    expect(html).toContain('3D Secure');
  });
});

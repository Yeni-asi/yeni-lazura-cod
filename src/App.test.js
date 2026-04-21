import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Lazura Cod giriş ekranı', () => {
  render(<App />);
  expect(screen.getByText(/lazura cod/i)).toBeInTheDocument();
  expect(screen.getByText(/yönetici girişi/i)).toBeInTheDocument();
  expect(screen.getByText(/firma girişi/i)).toBeInTheDocument();
});

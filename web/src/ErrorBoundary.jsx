import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught application render error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0c] flex flex-col items-center justify-center p-4 transition-colors">
          <div className="bg-white dark:bg-[#121215] p-8 md:p-12 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 text-center max-w-md w-full">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-purple-600 to-indigo-600 dark:from-red-500 dark:via-purple-500 dark:to-indigo-400 mb-2 select-none">
              AIO Calender MK2
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              An unexpected error occurred while loading the view.
            </p>
            {this.state.error?.message && (
              <div className="p-3 mb-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg text-xs font-mono text-red-700 dark:text-red-400 text-left overflow-auto max-h-32">
                {this.state.error.message}
              </div>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-3 px-4 bg-gray-900 hover:bg-black text-white dark:bg-white dark:text-black dark:hover:bg-gray-200 font-bold text-sm rounded-xl transition-all shadow-sm cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

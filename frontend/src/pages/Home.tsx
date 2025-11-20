/**
 * Home page component
 */
import { Link } from 'react-router-dom';

export function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Intelligent Content Detection
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            AI-powered photo analysis for construction and insurance
          </p>
          <Link
            to="/upload"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Upload Photo
          </Link>
        </div>
        
        <div className="mt-16 grid md:grid-cols-3 gap-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-3">Roof Damage Detection</h2>
            <p className="text-gray-600">
              Automatically identify hail, wind, and missing shingle damage with bounding boxes and severity ratings.
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-3">Material Detection</h2>
            <p className="text-gray-600">
              Count and identify construction materials like shingles, plywood, and more with brand recognition.
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-3">Fast & Accurate</h2>
            <p className="text-gray-600">
              Get results in under 500ms with high-confidence AI-powered analysis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


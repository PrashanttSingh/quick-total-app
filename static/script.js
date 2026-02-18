function uploadImage() {
    const file = document.getElementById('image').files[0];
    if (!file) { alert('Please select an image!'); return; }

    const formData = new FormData();
    formData.append('image', file);

    document.getElementById('result').innerHTML = '⏳ Processing...';

    fetch('/calculate', { method: 'POST', body: formData })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                document.getElementById('result').innerHTML = '❌ ' + data.error;
            } else {
                document.getElementById('result').innerHTML = `
                    <h3>Numbers Found: ${data.numbers.join(', ')}</h3>
                    <h2>Total: ${data.total}</h2>
                `;
            }
        });
}

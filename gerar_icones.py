"""
Script para gerar ícones da extensão Gmail Organizer
Execute: python gerar_icones.py
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    import os
except ImportError:
    print("Instalando dependências...")
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--trusted-host", "pypi.org", "--trusted-host", "pypi.python.org", "--trusted-host", "files.pythonhosted.org", "Pillow"])
    from PIL import Image, ImageDraw, ImageFont

def criar_icone(tamanho, nome_arquivo):
    """Cria um ícone de email simples"""
    # Cria imagem com fundo transparente
    img = Image.new('RGBA', (tamanho, tamanho), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Cor principal: azul do Gmail (#1a73e8)
    cor_principal = (26, 115, 232, 255)
    cor_borda = (21, 87, 176, 255)
    
    # Desenha envelope
    margem = tamanho * 0.15
    largura = tamanho - (margem * 2)
    altura = largura * 0.7
    
    x = margem
    y = margem
    
    # Corpo do envelope
    pontos_corpo = [
        (x, y + altura * 0.3),
        (x + largura, y + altura * 0.3),
        (x + largura, y + altura),
        (x, y + altura)
    ]
    draw.polygon(pontos_corpo, fill=cor_principal, outline=cor_borda, width=2)
    
    # Flap do envelope
    pontos_flap = [
        (x, y + altura * 0.3),
        (x + largura * 0.5, y),
        (x + largura, y + altura * 0.3)
    ]
    draw.polygon(pontos_flap, fill=cor_principal, outline=cor_borda, width=2)
    
    # Salva arquivo
    img.save(nome_arquivo, 'PNG')
    print(f"Criado: {nome_arquivo} ({tamanho}x{tamanho})")

def main():
    """Função principal"""
    # Cria diretório icons se não existir
    os.makedirs('icons', exist_ok=True)
    
    # Cria ícones em diferentes tamanhos
    tamanhos = [16, 48, 128]
    
    for tamanho in tamanhos:
        nome_arquivo = f'icons/icon{tamanho}.png'
        criar_icone(tamanho, nome_arquivo)
    
    print("\nTodos os icones foram criados com sucesso!")
    print("Arquivos salvos em: icons/")

if __name__ == '__main__':
    main()

